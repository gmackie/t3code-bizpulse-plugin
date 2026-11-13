import { describe, expect, it } from "bun:test";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";

import { connectedClient } from "../testing.ts";
import { createViewBridge, toolData, type BridgeWindow, type CallToolResult } from "./bridge.ts";

// Wires the view bridge to ext-apps' reference host (AppBridge) the way an
// iframe is wired to its parent.
function frame() {
  const listeners: ((event: { data: unknown; source?: unknown }) => void)[] = [];
  const parent = {
    postMessage(message: unknown) {
      queueMicrotask(() => hostTransport.onmessage?.(structuredClone(message) as never));
    },
  };
  const win: BridgeWindow = { parent, addEventListener: (_type, listener) => void listeners.push(listener) };
  const hostTransport = {
    onmessage: undefined as ((message: never) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    async start() {},
    async close() {
      hostTransport.onclose?.();
    },
    async send(message: unknown) {
      queueMicrotask(() => listeners.forEach((listener) => listener({ data: structuredClone(message), source: parent })));
    },
  };
  return { win, hostTransport, inject: (data: unknown, source: unknown) => listeners.forEach((listener) => listener({ data, source })) };
}

describe("view bridge against the ext-apps reference host", () => {
  it("initializes, receives the tool result and calls server tools through the host", async () => {
    const { client } = await connectedClient();
    const host = new AppBridge(client as never, { name: "reference-host", version: "1.0.0" }, { serverTools: {} });
    const { win, hostTransport } = frame();
    const initialized = new Promise<void>((resolve) => {
      host.oninitialized = () => resolve();
    });
    await host.connect(hostTransport as never);

    const view = createViewBridge(win, { name: "bizpulse-portfolio", version: "0.4.0" });
    const received: CallToolResult[] = [];
    view.onToolResult = (result) => received.push(result);
    await view.connect();
    await initialized;

    await host.sendToolResult((await client.callTool({ name: "bizpulse_portfolio", arguments: {} })) as never);
    await Bun.sleep(0);
    expect(toolData<{ opsScores: unknown[] }>(received[0]!).opsScores).toHaveLength(2);

    // View → host → MCP server, as the Review and Approve buttons do.
    const review = toolData<{ workflow: { currentStage: string } }>(await view.callTool("bizpulse_portfolio_review", {}));
    expect(review.workflow.currentStage).toBe("review");
    await expect(view.callTool("bizpulse_action_approve", { actionId: "a1" })).resolves.toMatchObject({ structuredContent: { status: "approved" } });
  });

  it("ignores messages that do not come from the host frame", () => {
    const { win, inject } = frame();
    const view = createViewBridge(win, { name: "bizpulse", version: "0" });
    let called = false;
    view.onToolResult = () => {
      called = true;
    };
    inject({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: {} }, { evil: true });
    expect(called).toBe(false);
  });

  it("surfaces tool errors from structured results", () => {
    expect(() => toolData({ isError: true, content: [{ type: "text", text: "BizPulse is temporarily unavailable" }] })).toThrow("BizPulse is temporarily unavailable");
  });
});
