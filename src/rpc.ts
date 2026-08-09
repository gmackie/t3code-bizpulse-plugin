import { buildSurfaceModel, type PulseSnapshot } from "./bizpulse.ts";

export function createRpcHandler(coordinator: {
  snapshot: PulseSnapshot | null;
  refresh(): Promise<PulseSnapshot>;
}) {
  return async (method: string, payload?: { navigationId?: string; panelId?: string; actionId?: string }) => {
    if (method !== "surface.get") return { ok: false as const, error: `unsupported BizPulse RPC method: ${method}` };
    const snapshot = coordinator.snapshot ?? (await coordinator.refresh());
    return { ok: true as const, result: buildSurfaceModel(snapshot, payload?.navigationId) };
  };
}
