export type PulseSnapshot = { healthScore: number | null; followUps: number };
export type CockpitViewModel = { navigation: readonly string[]; metrics: PulseSnapshot };
export type SurfaceModel = {
  pluginId: string;
  navigationId: string;
  title: string;
  refreshedAt: string;
  cards: readonly SurfaceCard[];
};
export type SurfaceCard =
  | { kind: "metric"; id: string; title: string; value: string; detail?: string; status?: "neutral" | "positive" | "warning" | "negative" }
  | { kind: "notice"; id: string; title: string; message: string; status?: "neutral" | "positive" | "warning" | "negative" };
export type CommandRunner = (command: readonly string[]) => Promise<unknown>;
export type PortfolioWorkflowModel = { readonly pluginId: string; readonly workflowId: string; readonly title: string; readonly currentStage: "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond"; readonly refreshedAt: string; readonly steps: readonly { id: string; stage: PortfolioWorkflowModel["currentStage"]; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[]; readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string }[]; readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[] };

export function normalizePulseSnapshot(value: any): PulseSnapshot {
  return { healthScore: typeof value?.growth?.score === "number" ? value.growth.score : typeof value?.score === "number" ? value.score : null, followUps: typeof value?.crm?.followUps === "number" ? value.crm.followUps : typeof value?.followUps === "number" ? value.followUps : 0 };
}
export function buildCockpitViewModel(snapshot: PulseSnapshot): CockpitViewModel { return { navigation: ["portfolio", "startups", "growth", "crm", "actions"], metrics: snapshot }; }
export function buildSurfaceModel(snapshot: PulseSnapshot, navigationId = "bizpulse.portfolio"): SurfaceModel {
  return {
    pluginId: "com.t3code.bizpulse",
    navigationId,
    title: "Portfolio pulse",
    refreshedAt: new Date().toISOString(),
    cards: [
      { kind: "metric", id: "health-score", title: "Health score", value: snapshot.healthScore === null ? "—" : `${snapshot.healthScore}`, status: snapshot.healthScore !== null && snapshot.healthScore >= 70 ? "positive" : "warning" },
      { kind: "metric", id: "follow-ups", title: "CRM follow-ups", value: `${snapshot.followUps}`, status: snapshot.followUps === 0 ? "positive" : "warning" },
      { kind: "notice", id: "source", title: "Live portfolio evidence", message: "Growth and CRM summaries are owned by BizPulse and refreshed by the plugin process." },
    ],
  };
}

export function buildReviewWorkflow(snapshot: PulseSnapshot, state: { readonly approved?: boolean } = {}): PortfolioWorkflowModel {
  const healthy = snapshot.healthScore !== null && snapshot.healthScore >= 70 && snapshot.followUps === 0;
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect portfolio health", state: "completed" as const },
    { id: "context", stage: "context" as const, title: "Collect growth and CRM context", state: "completed" as const, detail: `${snapshot.followUps} follow-ups` },
    { id: "propose", stage: "propose" as const, title: "Propose operator response", state: "completed" as const },
    { id: "review", stage: "review" as const, title: "Review portfolio response", state: state.approved ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve operator response", state: state.approved ? "completed" as const : "pending" as const },
    { id: "execute", stage: "execute" as const, title: "Execute BizPulse actions", state: state.approved ? "active" as const : "pending" as const },
    { id: "verify", stage: "verify" as const, title: "Verify portfolio response", state: "pending" as const, detail: healthy ? "Portfolio evidence is healthy" : "Follow-ups or health risks need attention" },
    { id: "respond", stage: "respond" as const, title: "Prepare stakeholder response", state: "pending" as const },
  ];
  return { pluginId: "com.t3code.bizpulse", workflowId: "bizpulse.portfolio-review", title: "Portfolio review", currentStage: state.approved ? "execute" : "review", refreshedAt: new Date().toISOString(), steps, evidence: [{ id: "portfolio-health", title: "Portfolio health", kind: "check", status: healthy ? "positive" : "warning", detail: `Health ${snapshot.healthScore ?? "unknown"} · ${snapshot.followUps} follow-ups` }], actions: state.approved ? [] : [{ id: "approve", title: "Approve operator response", tone: "primary" }] };
}

export function createBizPulseClient(input: { startupId: string; run: CommandRunner }) {
  return { async snapshot() { return normalizePulseSnapshot(await input.run(["growth", "review", "--startup", input.startupId, "--json"])); } };
}

export function normalizePollingSeconds(value: number | undefined): number { return Math.min(3600, Math.max(15, Math.floor(value ?? 60))); }
export function createPollingCoordinator<T>(input: { refresh: () => Promise<T>; intervalSeconds?: number; onError?: (error: unknown) => void }) { let cached: T | null = null; let timer: ReturnType<typeof setTimeout> | undefined; let active = false; const interval = normalizePollingSeconds(input.intervalSeconds) * 1000; const tick = async () => { if (!active) return; try { cached = await input.refresh(); } catch (error) { input.onError?.(error); } finally { if (active) timer = setTimeout(tick, interval); } }; return { get snapshot() { return cached; }, async refresh() { cached = await input.refresh(); return cached; }, start() { active = true; void tick(); }, stop() { active = false; if (timer) clearTimeout(timer); } }; }
