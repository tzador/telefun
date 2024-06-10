import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { server, emitter } from "../src/telefun";

const service = {
  calculator: {
    add: async (a: number, b: number) => a + b,
    sub: async (a: number, b: number) => a - b
  },
  time: async () => {
    return (async function* () {
      for (let i = 0; i < 10; i++) {
        yield new Date().toISOString();
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
  },
  time2: async (timezone: string) =>
    emitter<{ now: number; timezone: string }>(async (emit) => {
      for (let i = 0; i < 10; i++) {
        emit({ now: Date.now(), timezone });
        await new Promise((r) => setTimeout(r, 1000));
      }
    })
};

export type Service = typeof service;

const app = new Hono();

app.use("/telefun/*", cors());
app.post("/telefun/*", async (c) => await server(service)(c.req.raw));

serve(app);
