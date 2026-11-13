import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { buildReviewWorkflow, normalizePulseSnapshot, type BizPulseClient } from "./bizpulse.ts";
import { VIEWS, viewHtml, type ViewName } from "./views/html.ts";
import type { CrmData, PortfolioData, ReviewData } from "./views/render.ts";

export const SERVER_INFO = { name: "bizpulse", version: "0.4.0" } as const;

export type BizPulseServerOptions = {
  client: BizPulseClient;
  startupId?: string;
  pollSeconds: number;
};

const startupArg = z.string().min(1).optional().describe("BizPulse startup id; defaults to BIZPULSE_STARTUP_ID");

// Every call reads BizPulse afresh: T3 runs one stdio copy per agent session
// plus one in its pool, so nothing is cached in the process.
export function createBizPulseMcpServer(options: BizPulseServerOptions): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "BizPulse tracks startup portfolio health, growth bottlenecks, CRM follow-ups and proposed agent actions. Use bizpulse_portfolio for the portfolio, bizpulse_portfolio_review for one startup. Only a human can approve a BizPulse action, from the portfolio review view.",
  });

  const startup = (override?: string) => {
    const id = override ?? options.startupId;
    if (!id) throw new Error("No BizPulse startup selected: set BIZPULSE_STARTUP_ID or pass startupId (bizpulse_portfolio lists startup ids)");
    return id;
  };

  async function review(startupId: string): Promise<ReviewData> {
    const [status, growth, followups, actions] = await Promise.all([
      options.client.status(),
      options.client.growthReview(startupId),
      options.client.followups(startupId),
      options.client.actions(startupId),
    ]);
    const ops = status.opsScores.find((score) => score.startupId === startupId);
    const snapshot = normalizePulseSnapshot({ opsScore: ops, followups });
    return { startupId, startupName: ops?.name ?? startupId, snapshot, growth, followups, actions, workflow: buildReviewWorkflow(snapshot, actions) };
  }

  for (const [name, view] of Object.entries(VIEWS) as [ViewName, (typeof VIEWS)[ViewName]][]) {
    registerAppResource(server, view.title, view.uri, { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } }, async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: await viewHtml(name), _meta: { ui: { prefersBorder: true } } }],
    }));
  }

  registerAppTool(
    server,
    "bizpulse_portfolio",
    {
      title: "BizPulse portfolio",
      description: "Portfolio overview from BizPulse: every startup's ops score, grade, status and top alert, plus portfolio MRR, failed payments and open alerts. Renders the portfolio view.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.portfolio.uri, visibility: ["model", "app"] } },
    },
    async () =>
      result(async () => {
        const status = await options.client.status();
        const data: PortfolioData = { ...status, ...(options.startupId ? { defaultStartupId: options.startupId } : {}), pollSeconds: options.pollSeconds, refreshedAt: new Date().toISOString() };
        const alerts = new Map(status.startups.map((item) => [item.id, item.urgency?.level !== "ok" ? item.urgency?.topIssue : undefined]));
        const lines = status.opsScores.map((s) => `- ${s.name} (${s.startupId}): score ${s.score ?? "—"} grade ${s.grade} [${s.status}]${alerts.get(s.startupId) ? ` alert: ${alerts.get(s.startupId)}` : ""}`);
        return { data, text: `${status.opsScores.length} startups. MRR ${status.portfolio.mrr}, ${status.portfolio.openAlerts} open alerts, ${status.portfolio.failedPayments} failed payments.\n${lines.join("\n")}` };
      }),
  );

  registerAppTool(
    server,
    "bizpulse_portfolio_review",
    {
      title: "BizPulse portfolio review",
      description: "Portfolio review for one startup: ops score, growth bottlenecks, CRM follow-ups and BizPulse's proposed agent actions. A human approves actions from the rendered view.",
      inputSchema: z.object({ startupId: startupArg }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.review.uri, visibility: ["model", "app"] } },
    },
    async ({ startupId }) =>
      result(async () => {
        const data = await review(startup(startupId));
        const pending = data.actions.filter((action) => action.status === "proposed" || action.status === "draft");
        return {
          data,
          text: [
            `Portfolio review for ${data.startupName}: stage ${data.workflow.currentStage}, ops score ${data.snapshot.healthScore ?? "unknown"}, ${data.followups.length} follow-ups.`,
            data.growth.headline,
            ...data.growth.bottlenecks.map((b) => `- bottleneck ${b.area} (${b.score}): ${b.title}`),
            ...pending.map((a) => `- awaiting human approval: ${a.id} ${a.title} (${a.targetSystem}:${a.actionType}, ${a.risk})`),
          ].join("\n"),
        };
      }),
  );

  registerAppTool(
    server,
    "bizpulse_crm_followups",
    {
      title: "BizPulse CRM follow-ups",
      description: "Stale CRM contacts BizPulse says need a follow-up today, with priority and reason. Renders the CRM follow-ups view.",
      inputSchema: z.object({ startupId: startupArg }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.crm.uri, visibility: ["model", "app"] } },
    },
    async ({ startupId }) =>
      result(async () => {
        const id = startup(startupId);
        const followups = await options.client.followups(id);
        const data: CrmData = { startupId: id, followups, pollSeconds: options.pollSeconds, refreshedAt: new Date().toISOString() };
        const lines = followups.map((f) => `- [${f.priority}] ${f.name}${f.company ? ` (${f.company})` : ""}, ${f.staleDays}d stale: ${f.reason}`);
        return { data, text: followups.length ? `${followups.length} follow-ups due.\n${lines.join("\n")}` : "No CRM follow-ups due." };
      }),
  );

  server.registerTool(
    "bizpulse_growth_review",
    {
      title: "BizPulse growth review",
      description: "Weekly growth review for one startup: headline, ranked bottlenecks and recommended actions.",
      inputSchema: z.object({ startupId: startupArg }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ startupId }) =>
      result(async () => {
        const growth = await options.client.growthReview(startup(startupId));
        const lines = [
          growth.headline,
          ...growth.bottlenecks.map((b) => `- ${b.area} (${b.score}, ${b.source}): ${b.title}`),
          ...growth.recommendedActions.map((a) => `- recommended: ${a.title} (${a.targetSystem}:${a.actionType}, ${a.risk})`),
        ];
        return { data: growth, text: lines.join("\n") };
      }),
  );

  server.registerTool(
    "bizpulse_actions_list",
    {
      title: "BizPulse agent actions",
      description: "Proposed, approved and finished BizPulse agent actions for one startup.",
      inputSchema: z.object({ startupId: startupArg }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ startupId }) =>
      result(async () => {
        const id = startup(startupId);
        const actions = await options.client.actions(id);
        return { data: { startupId: id, actions }, text: actions.map((a) => `- ${a.id} [${a.status}] ${a.title} (${a.targetSystem}:${a.actionType}, ${a.risk})`).join("\n") || "No BizPulse actions." };
      }),
  );

  // App-only: an agent cannot approve BizPulse actions; T3 hides this tool
  // from the model and only lets a view call it.
  server.registerTool(
    "bizpulse_action_approve",
    {
      title: "Approve BizPulse action",
      description: "Approve a proposed BizPulse agent action as the signed-in BizPulse user.",
      inputSchema: z.object({ actionId: z.string().min(1).describe("BizPulse action id") }),
      annotations: { idempotentHint: true, openWorldHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ actionId }) =>
      result(async () => {
        const action = await options.client.approveAction(actionId);
        return { data: action, text: `BizPulse action ${actionId} is ${action.status}.` };
      }),
  );

  return server;
}

async function result(run: () => Promise<{ data: unknown; text: string }>): Promise<CallToolResult> {
  try {
    const { data, text } = await run();
    return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
