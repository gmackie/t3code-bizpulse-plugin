// BizPulse domain model. BizPulse owns its credentials and state; the plugin
// reads it through the `pulse` CLI's JSON-first commands (`--json`).

export type Tone = "neutral" | "positive" | "warning" | "negative";

export type PulseSnapshot = { healthScore: number | null; followUps: number };

export type OpsScore = { startupId: string; name: string; score: number | null; grade: string; status: string };
export type TriageStartup = { id: string; name: string; urgency?: { level?: string; topIssue?: string } };
export type PortfolioStatus = {
  opsScores: readonly OpsScore[];
  startups: readonly TriageStartup[];
  portfolio: { mrr: number; failedPayments: number; openAlerts: number; runway: number | null };
};

export type GrowthBottleneck = { area: string; title: string; score: number; source: string; summary?: string };
export type GrowthAction = { title: string; actionType: string; targetSystem: string; risk: string };
export type GrowthReview = { headline: string; bottlenecks: readonly GrowthBottleneck[]; recommendedActions: readonly GrowthAction[] };

export type CrmFollowup = { contactId: string; name: string; company?: string; email?: string; staleDays: number; reason: string; priority: string };

export type AgentAction = { id: string; title: string; targetSystem: string; actionType: string; risk: string; status: string };

export type CommandRunner = (command: readonly string[]) => Promise<unknown>;

type Stage = "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond";
export type PortfolioWorkflowModel = {
  readonly pluginId: string;
  readonly workflowId: string;
  readonly title: string;
  readonly currentStage: Stage;
  readonly refreshedAt: string;
  readonly steps: readonly { id: string; stage: Stage; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[];
  readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: Tone; detail?: string }[];
  readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[];
};

export const PLUGIN_ID = "com.t3code.bizpulse";
export const REVIEW_WORKFLOW_ID = "bizpulse.portfolio-review";

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function normalizePulseSnapshot(value: any): PulseSnapshot {
  const followUps = Array.isArray(value?.followups) ? value.followups.length : typeof value?.crm?.followUps === "number" ? value.crm.followUps : typeof value?.followUps === "number" ? value.followUps : 0;
  const healthScore = typeof value?.opsScore?.score === "number" ? value.opsScore.score : typeof value?.growth?.score === "number" ? value.growth.score : typeof value?.score === "number" ? value.score : null;
  return { healthScore, followUps };
}

/** `pulse status --json` */
export function normalizePortfolioStatus(value: unknown): PortfolioStatus {
  const raw = record(value);
  const portfolio = record(raw.portfolio);
  return {
    opsScores: list(raw.opsScores).map((item) => {
      const score = record(item);
      return { startupId: str(score.startupId), name: str(score.name, "Unnamed startup"), score: num(score.score), grade: str(score.grade, "—"), status: str(score.status, "unknown") };
    }),
    startups: list(raw.startups).map((item) => {
      const startup = record(item);
      const urgency = record(startup.urgency);
      return { id: str(startup.id), name: str(startup.name), urgency: { level: str(urgency.level, "ok"), ...(typeof urgency.topIssue === "string" ? { topIssue: urgency.topIssue } : {}) } };
    }),
    portfolio: { mrr: num(portfolio.mrr) ?? 0, failedPayments: num(portfolio.failedPayments) ?? 0, openAlerts: num(portfolio.openAlerts) ?? 0, runway: num(portfolio.runway) },
  };
}

/** `pulse growth review --startup <id> --json` */
export function normalizeGrowthReview(value: unknown): GrowthReview {
  const raw = record(value);
  return {
    headline: str(raw.headline, "No growth review headline."),
    bottlenecks: list(raw.bottlenecks).map((item) => {
      const b = record(item);
      return { area: str(b.area), title: str(b.title), score: num(b.score) ?? 0, source: str(b.source), ...(typeof b.summary === "string" ? { summary: b.summary } : {}) };
    }),
    recommendedActions: list(raw.recommendedActions).map((item) => {
      const a = record(item);
      return { title: str(a.title), actionType: str(a.actionType), targetSystem: str(a.targetSystem), risk: str(a.risk) };
    }),
  };
}

/** `pulse crm daily-followups --startup <id> --json` */
export function normalizeFollowups(value: unknown): CrmFollowup[] {
  return list(value).map((item) => {
    const f = record(item);
    return {
      contactId: str(f.contactId),
      name: str(f.name, "Unknown contact"),
      ...(typeof f.company === "string" ? { company: f.company } : {}),
      ...(typeof f.email === "string" ? { email: f.email } : {}),
      staleDays: num(f.staleDays) ?? 0,
      reason: str(f.reason),
      priority: str(f.priority, "medium"),
    };
  });
}

/** `pulse actions list --startup <id> --json` */
export function normalizeActions(value: unknown): AgentAction[] {
  return list(value).map(normalizeAction);
}

export function normalizeAction(value: unknown): AgentAction {
  const a = record(value);
  return { id: str(a.id), title: str(a.title), targetSystem: str(a.targetSystem), actionType: str(a.actionType), risk: str(a.risk), status: str(a.status, "unknown") };
}

export function createBizPulseClient(input: { run: CommandRunner }) {
  const run = input.run;
  return {
    status: async () => normalizePortfolioStatus(await run(["status", "--json"])),
    growthReview: async (startupId: string) => normalizeGrowthReview(await run(["growth", "review", "--startup", startupId, "--json"])),
    followups: async (startupId: string) => normalizeFollowups(await run(["crm", "daily-followups", "--startup", startupId, "--json"])),
    actions: async (startupId: string) => normalizeActions(await run(["actions", "list", "--startup", startupId, "--json"])),
    approveAction: async (actionId: string) => normalizeAction(await run(["actions", "approve", actionId, "--json"])),
  };
}
export type BizPulseClient = ReturnType<typeof createBizPulseClient>;

export const POLL_SECONDS = { default: 60, min: 15, max: 3600 } as const;
export function normalizePollingSeconds(value: number | undefined): number {
  const seconds = value === undefined || !Number.isFinite(value) ? POLL_SECONDS.default : value;
  return Math.min(POLL_SECONDS.max, Math.max(POLL_SECONDS.min, Math.floor(seconds)));
}

export const healthTone = (score: number | null): Tone => (score === null ? "neutral" : score >= 70 ? "positive" : score >= 50 ? "warning" : "negative");

/**
 * The v1 "Portfolio review" workflow, driven by real BizPulse state: the
 * operator response is BizPulse's proposed agent actions, approving one goes
 * through BizPulse, and BizPulse itself executes approved actions.
 */
export function buildReviewWorkflow(snapshot: PulseSnapshot, actions: readonly AgentAction[] = []): PortfolioWorkflowModel {
  const healthy = snapshot.healthScore !== null && snapshot.healthScore >= 70 && snapshot.followUps === 0;
  const proposed = actions.filter((action) => action.status === "proposed" || action.status === "draft");
  const approved = actions.filter((action) => action.status === "approved" || action.status === "executing");
  const done = actions.filter((action) => action.status === "completed");
  const failed = actions.filter((action) => action.status === "failed");
  const reviewing = proposed.length > 0;
  const currentStage: Stage = reviewing ? "review" : approved.length > 0 ? "execute" : failed.length > 0 || done.length > 0 ? "verify" : "propose";
  const steps: PortfolioWorkflowModel["steps"] = [
    { id: "inspect", stage: "inspect", title: "Inspect portfolio health", state: "completed", detail: `Ops score ${snapshot.healthScore ?? "unknown"}` },
    { id: "context", stage: "context", title: "Collect growth and CRM context", state: "completed", detail: `${snapshot.followUps} follow-ups due` },
    { id: "propose", stage: "propose", title: "Proposed operator response", state: actions.length === 0 ? "active" : "completed", detail: actions.length === 0 ? "BizPulse has no agent actions for this startup" : `${actions.length} BizPulse actions` },
    { id: "review", stage: "review", title: "Review proposed actions", state: reviewing ? "active" : actions.length ? "completed" : "pending", ...(reviewing ? { detail: `${proposed.length} awaiting approval` } : {}) },
    { id: "approve", stage: "approve", title: "Approve operator response", state: reviewing ? "pending" : approved.length || done.length ? "completed" : "pending" },
    { id: "execute", stage: "execute", title: "BizPulse executes approved actions", state: approved.length ? "active" : done.length ? "completed" : failed.length ? "failed" : "pending", ...(approved.length ? { detail: `${approved.length} approved, waiting for BizPulse` } : failed.length ? { detail: `${failed.length} failed` } : {}) },
    { id: "verify", stage: "verify", title: "Verify portfolio response", state: currentStage === "verify" ? "active" : "pending", detail: healthy ? "Portfolio evidence is healthy" : "Follow-ups or health risks need attention" },
    { id: "respond", stage: "respond", title: "Prepare stakeholder response", state: "pending" },
  ];
  return {
    pluginId: PLUGIN_ID,
    workflowId: REVIEW_WORKFLOW_ID,
    title: "Portfolio review",
    currentStage,
    refreshedAt: new Date().toISOString(),
    steps,
    evidence: [{ id: "portfolio-health", title: "Portfolio health", kind: "check", status: healthy ? "positive" : "warning", detail: `Health ${snapshot.healthScore ?? "unknown"} · ${snapshot.followUps} follow-ups` }],
    actions: proposed.map((action) => ({ id: `approve:${action.id}`, title: `Approve: ${action.title}`, tone: "primary" as const })),
  };
}
