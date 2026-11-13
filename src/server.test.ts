import { describe, expect, it } from "bun:test";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { ACME, connectedClient, fakePulse } from "./testing.ts";

type Structured<T> = { structuredContent?: T; isError?: boolean; content: { type: string; text?: string }[] };
const call = async <T = Record<string, unknown>>(client: Awaited<ReturnType<typeof connectedClient>>["client"], name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as unknown as Structured<T>;

describe("BizPulse MCP server", () => {
  it("links UI tools to ui:// views and hides approval from the model", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect([...byName.keys()].sort()).toEqual([
      "bizpulse_action_approve",
      "bizpulse_actions_list",
      "bizpulse_crm_followups",
      "bizpulse_growth_review",
      "bizpulse_portfolio",
      "bizpulse_portfolio_review",
    ]);
    expect(byName.get("bizpulse_portfolio")?._meta).toMatchObject({ ui: { resourceUri: "ui://bizpulse/portfolio.html", visibility: ["model", "app"] } });
    expect(byName.get("bizpulse_portfolio_review")?._meta).toMatchObject({ ui: { resourceUri: "ui://bizpulse/portfolio-review.html" } });
    expect(byName.get("bizpulse_crm_followups")?._meta).toMatchObject({ ui: { resourceUri: "ui://bizpulse/crm.html" } });
    expect(byName.get("bizpulse_action_approve")?._meta).toEqual({ ui: { visibility: ["app"] } });
    // T3 only lets a view call tools whose visibility includes "app".
    for (const name of ["bizpulse_portfolio", "bizpulse_portfolio_review", "bizpulse_crm_followups", "bizpulse_action_approve"]) {
      expect((byName.get(name)?._meta as { ui: { visibility: string[] } }).ui.visibility).toContain("app");
    }
  });

  it("serves each view as a self-contained MCP App resource", async () => {
    const { client } = await connectedClient();
    const { resources } = await client.listResources();
    expect(resources.map((resource) => [resource.uri, resource.mimeType])).toEqual([
      ["ui://bizpulse/portfolio.html", RESOURCE_MIME_TYPE],
      ["ui://bizpulse/portfolio-review.html", RESOURCE_MIME_TYPE],
      ["ui://bizpulse/crm.html", RESOURCE_MIME_TYPE],
    ]);
    for (const resource of resources) {
      const { contents } = await client.readResource({ uri: resource.uri });
      const html = (contents[0] as { text: string }).text;
      expect(html).toStartWith("<!doctype html>");
      expect(html).toContain("ui/initialize");
      expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
      expect(html.length).toBeLessThan(100_000);
    }
  });

  it("reads the portfolio from the pulse CLI", async () => {
    const { client, calls } = await connectedClient();
    const result = await call<{ opsScores: { name: string }[]; portfolio: { mrr: number }; pollSeconds: number }>(client, "bizpulse_portfolio");
    expect(result.isError).toBeFalsy();
    expect(calls).toEqual([["status", "--json"]]);
    expect(result.structuredContent).toMatchObject({ portfolio: { mrr: 1234500, openAlerts: 2 }, pollSeconds: 30, defaultStartupId: ACME });
    expect(result.structuredContent?.opsScores.map((s) => s.name)).toEqual(["Acme", "Globex"]);
    expect(result.content[0]?.text).toContain("alert: 3 failed payments");
  });

  it("builds the portfolio review from growth, CRM and action evidence", async () => {
    const { client, calls } = await connectedClient();
    const result = await call<{ startupName: string; snapshot: { healthScore: number; followUps: number }; workflow: { currentStage: string; actions: { id: string }[] } }>(client, "bizpulse_portfolio_review");
    expect(result.isError).toBeFalsy();
    expect(calls).toContainEqual(["growth", "review", "--startup", ACME, "--json"]);
    expect(calls).toContainEqual(["crm", "daily-followups", "--startup", ACME, "--json"]);
    expect(calls).toContainEqual(["actions", "list", "--startup", ACME, "--json"]);
    expect(result.structuredContent).toMatchObject({ startupName: "Acme", snapshot: { healthScore: 64, followUps: 1 }, workflow: { currentStage: "review", actions: [{ id: "approve:a1" }] } });
    expect(result.content[0]?.text).toContain("awaiting human approval: a1");
  });

  it("approves an action through BizPulse and the review moves on", async () => {
    const { client, calls } = await connectedClient();
    const approved = await call<{ status: string }>(client, "bizpulse_action_approve", { actionId: "a1" });
    expect(approved.isError).toBeFalsy();
    expect(approved.structuredContent?.status).toBe("approved");
    expect(calls).toContainEqual(["actions", "approve", "a1", "--json"]);
    const after = await connectedClient({ run: fakePulse({ FAKE_PULSE_APPROVED: "1" }).run });
    expect((await call<{ workflow: { currentStage: string } }>(after.client, "bizpulse_portfolio_review")).structuredContent?.workflow.currentStage).toBe("execute");
  });

  it("lists CRM follow-ups, growth review and actions for an explicit startup", async () => {
    const { client, calls } = await connectedClient({ startupId: null });
    const crm = await call<{ followups: { name: string }[] }>(client, "bizpulse_crm_followups", { startupId: ACME });
    expect(crm.structuredContent?.followups.map((f) => f.name)).toEqual(["Ada <Lovelace>"]);
    expect((await call<{ headline: string }>(client, "bizpulse_growth_review", { startupId: ACME })).structuredContent?.headline).toContain("Activation");
    expect((await call(client, "bizpulse_actions_list", { startupId: ACME })).content[0]?.text).toContain("a1 [proposed]");
    expect(calls.every((args) => args.includes(ACME))).toBe(true);
  });

  it("asks for a startup when none is configured", async () => {
    const { client, calls } = await connectedClient({ startupId: null });
    for (const name of ["bizpulse_portfolio_review", "bizpulse_crm_followups", "bizpulse_growth_review", "bizpulse_actions_list"]) {
      const result = await call(client, name);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("BIZPULSE_STARTUP_ID");
    }
    expect(calls).toEqual([]);
  });

  it("reports a missing CLI, a signed-out CLI and upstream failures without leaking details", async () => {
    const missing = await connectedClient({ run: (await import("./cli.ts")).createCliRunner({ command: ["/nonexistent/pulse-cli"] }) });
    const missingResult = await call(missing.client, "bizpulse_portfolio");
    expect(missingResult.isError).toBe(true);
    expect(missingResult.content[0]?.text).toContain("BIZPULSE_COMMAND");

    const denied = await call(( await connectedClient({ run: fakePulse({ FAKE_PULSE_MODE: "denied" }).run })).client, "bizpulse_portfolio");
    expect(denied).toMatchObject({ isError: true, content: [{ text: "Not authenticated. Run `pulse login` first." }] });

    const down = await call((await connectedClient({ run: fakePulse({ FAKE_PULSE_MODE: "fail" }).run })).client, "bizpulse_portfolio");
    expect(down).toMatchObject({ isError: true, content: [{ text: "BizPulse is temporarily unavailable" }] });
    expect(down.content[0]?.text).not.toContain("http");

    const garbage = await call((await connectedClient({ run: fakePulse({ FAKE_PULSE_MODE: "garbage" }).run })).client, "bizpulse_portfolio");
    expect(garbage).toMatchObject({ isError: true, content: [{ text: "BizPulse CLI returned output that is not JSON" }] });

    const approve = await call((await connectedClient({ run: fakePulse({ FAKE_PULSE_MODE: "fail" }).run })).client, "bizpulse_action_approve", { actionId: "a1" });
    expect(approve.isError).toBe(true);
  });

  it("times out a CLI call that never answers", async () => {
    const { client } = await connectedClient({ run: fakePulse({ FAKE_PULSE_MODE: "hang" }, 300).run });
    const result = await call(client, "bizpulse_portfolio");
    expect(result).toMatchObject({ isError: true, content: [{ text: "BizPulse did not answer within 1s" }] });
  });
});
