export type PulseSnapshot = { healthScore: number | null; followUps: number };
export type CommandRunner = (command: readonly string[]) => Promise<unknown>;

export function normalizePulseSnapshot(value: any): PulseSnapshot {
  return { healthScore: typeof value?.growth?.score === "number" ? value.growth.score : typeof value?.score === "number" ? value.score : null, followUps: typeof value?.crm?.followUps === "number" ? value.crm.followUps : typeof value?.followUps === "number" ? value.followUps : 0 };
}

export function createBizPulseClient(input: { startupId: string; run: CommandRunner }) {
  return { async snapshot() { return normalizePulseSnapshot(await input.run(["growth", "review", "--startup", input.startupId, "--json"])); } };
}

export function normalizePollingSeconds(value: number | undefined): number { return Math.min(3600, Math.max(15, Math.floor(value ?? 60))); }
export function createPollingCoordinator<T>(input: { refresh: () => Promise<T>; intervalSeconds?: number; onError?: (error: unknown) => void }) { let cached: T | null = null; let timer: ReturnType<typeof setTimeout> | undefined; let active = false; const interval = normalizePollingSeconds(input.intervalSeconds) * 1000; const tick = async () => { if (!active) return; try { cached = await input.refresh(); } catch (error) { input.onError?.(error); } finally { if (active) timer = setTimeout(tick, interval); } }; return { get snapshot() { return cached; }, async refresh() { cached = await input.refresh(); return cached; }, start() { active = true; void tick(); }, stop() { active = false; if (timer) clearTimeout(timer); } }; }
