import { remote } from "../src/telefun";
import type { Service } from "./server";

const client = remote<Service>("http://localhost:3000/telefun");
console.log({ sum: await client.calculator.add(1, 2) });
console.log({ diff: await client.calculator.sub(3, 2) });

for await (const time of await client.time2("UTC")) {
  console.log({ time });
}
