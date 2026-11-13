import { expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import manifest from "../t3-plugin.json";
import { ACME, FAKE_PULSE } from "./testing.ts";

it("launches the installed manifest from another directory and serves its panels", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bizpulse-install-"));
  const root = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
  const transport = new StdioClientTransport({
    command: manifest.mcpServer.transport.command,
    args: manifest.mcpServer.transport.args.map((arg) => arg.replaceAll("${pluginRoot}", root)),
    cwd,
    env: { PATH: process.env.PATH ?? "", BIZPULSE_COMMAND: FAKE_PULSE.join(" "), BIZPULSE_STARTUP_ID: ACME },
  });
  const client = new Client({ name: "installation-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("bizpulse_portfolio");
    const resources = (await client.listResources()).resources;
    for (const panel of manifest.contributes.panels) {
      expect(resources.some((resource) => resource.uri === panel.resourceUri)).toBe(true);
      const view = await client.readResource({ uri: panel.resourceUri });
      expect(view.contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app" });
      expect(view.contents[0]).toHaveProperty("text", expect.stringContaining("ui/initialize"));
    }
    // A panel's opening tool runs end to end through the configured CLI.
    const opened = await client.callTool({ name: "bizpulse_portfolio", arguments: {} });
    expect(opened.isError).toBeFalsy();
  } finally {
    await client.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
