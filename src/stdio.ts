import { createBizPulseClient, type PulseSnapshot } from "./bizpulse.ts";
import { createRpcHandler } from "./rpc.ts";

let snapshot = JSON.parse(process.env.T3_PLUGIN_SNAPSHOT ?? '{"healthScore":null,"followUps":0}') as PulseSnapshot;
const commandPrefix = process.env.T3_PLUGIN_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
const client = commandPrefix.length > 0
  ? createBizPulseClient({
      startupId: process.env.T3_PLUGIN_STARTUP ?? "",
      run: async (args) => {
        const process = Bun.spawn([...commandPrefix, ...args], { stdout: "pipe", stderr: "ignore" });
        const output = await new Response(process.stdout).text();
        await process.exited;
        return JSON.parse(output) as unknown;
      },
    })
  : null;
const refresh = async () => { if (client) snapshot = await client.snapshot(); return snapshot; };
const handler = createRpcHandler({ get snapshot() { return snapshot; }, refresh });
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { requestId: string; method: string; payload?: { navigationId?: string } };
      void handler(request.method, request.payload).then((result) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ...result })}\n`));
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: "unknown", ok: false, error: error instanceof Error ? error.message : "invalid request" })}\n`);
    }
  }
});
