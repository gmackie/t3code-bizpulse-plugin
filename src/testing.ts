// Test fixtures shared by the MCP server and view-bridge tests.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createBizPulseClient, type CommandRunner } from "./bizpulse.ts";
import { createCliRunner } from "./cli.ts";
import { createBizPulseMcpServer } from "./server.ts";

export const ACME = "11111111-1111-4111-8111-111111111111";
export const FAKE_PULSE = ["bun", new URL("../scripts/fake-pulse.ts", import.meta.url).pathname];

/** Runs scripts/fake-pulse.ts as the CLI, so tests cover the real subprocess path. */
export function fakePulse(env: Record<string, string> = {}, timeoutMs?: number): { run: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner = createCliRunner({ command: FAKE_PULSE, env: { ...process.env, ...env }, ...(timeoutMs ? { timeoutMs } : {}) });
  return { calls, run: async (args) => (calls.push([...args]), runner(args)) };
}

export async function connectedClient(options: { run?: CommandRunner; startupId?: string | null } = {}) {
  const fake = options.run ? { run: options.run, calls: [] } : fakePulse();
  const server = createBizPulseMcpServer({
    client: createBizPulseClient({ run: fake.run }),
    ...(options.startupId === null ? {} : { startupId: options.startupId ?? ACME }),
    pollSeconds: 30,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server, calls: fake.calls };
}
