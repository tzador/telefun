export const remote = <S extends object>(endpoint: string): S => {
  function proxy(_target: any, prefix: string[]): any {
    return new Proxy(
      async (...args: any[]) => {
        const url = endpoint.replace(/\/$/, "") + "/" + prefix.join(".");

        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(args),
          headers: { "Content-Type": "application/json" }
        });

        if (response.headers.get("Content-Type") === "text/event-stream") {
          return (async function* () {
            const reader = response.body?.getReader();
            if (!reader) return;
            let buffer = "";
            const decoder = new TextDecoder("utf-8");
            for (;;) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value);
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  yield JSON.parse(line.slice(6));
                }
              }
            }
          })();
        } else {
          return await response.json();
        }
      },
      {
        get: (_target, name) => {
          if (typeof name === "string") {
            return proxy(_target, [...prefix, name]);
          } else {
            new Error("Invalid service name type, string expected");
          }
        }
      }
    ) as any;
  }

  return proxy({}, []) as S;
};

export const server =
  <S extends object>(service: S) =>
  async (request: Request) => {
    async function route(path: string[], service: any) {
      if (path.length === 0) {
        if (typeof service === "function") {
          const result = await service(...(await request.json()));

          if (typeof result[Symbol.asyncIterator] === "function") {
            const encoder = new TextEncoder();
            const readable = new ReadableStream({
              start(controller) {
                (async () => {
                  try {
                    for await (const event of result) {
                      controller.enqueue(
                        encoder.encode(
                          "data: " + JSON.stringify(event) + "\n\n"
                        )
                      );
                    }
                  } finally {
                    controller.close();
                  }
                })();
              }
            });
            return new Response(readable, {
              headers: {
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache"
              }
            });
          } else if ((result as any)[emitterSymbol] === true) {
            const encoder = new TextEncoder();
            const readable = new ReadableStream({
              async start(controller) {
                const emit = (event: any) => {
                  controller.enqueue(
                    encoder.encode("data: " + JSON.stringify(event) + "\n\n")
                  );
                };
                try {
                  await (result as any)(emit);
                } finally {
                  controller.close();
                }
              }
            });
            return new Response(readable, {
              headers: {
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache"
              }
            });
          } else {
            return Response.json(result);
          }
        }
      } else if (typeof service === "object") {
        return await route(path.slice(1), service[path[0]]);
      } else {
        return Response.json(
          { status: "error", error: { code: "not_found" } },
          {
            status: 404,
            statusText: "Not Found"
          }
        );
      }
    }
    return await route(
      new URL(request.url).pathname.split("/").pop()!.split("."),
      service
    );
  };

const emitterSymbol = Symbol("emitter");

export const emitter = <T>(fn: (emit: (value: T) => void) => void) => {
  (fn as any)[emitterSymbol] = true;
  return fn;
};
