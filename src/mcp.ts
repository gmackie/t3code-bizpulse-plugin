#!/usr/bin/env bun
// Stdio entry point for the MCP-native BizPulse plugin (manifest v2 `mcpServer`).
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createBizPulseClient } from "./bizpulse.ts";
import { createCliRunner } from "./cli.ts";
import { loadConfig } from "./config.ts";
import { createBizPulseMcpServer } from "./server.ts";

const config = loadConfig();
const server = createBizPulseMcpServer({
  client: createBizPulseClient({ run: createCliRunner({ command: config.command }) }),
  ...(config.startupId ? { startupId: config.startupId } : {}),
  pollSeconds: config.pollSeconds,
});
await server.connect(new StdioServerTransport());
