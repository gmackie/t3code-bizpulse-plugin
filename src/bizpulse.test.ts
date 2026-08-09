import { describe, expect, test } from "bun:test";
import { buildCockpitViewModel, buildSurfaceModel, createBizPulseClient, createPollingCoordinator, normalizePulseSnapshot } from "./bizpulse.ts";

describe("BizPulse adapter", () => {
  test("normalizes growth and CRM evidence into a plugin snapshot", () => {
    expect(normalizePulseSnapshot({ growth: { score: 82 }, crm: { followUps: 3 } })).toEqual({
      healthScore: 82,
      followUps: 3,
    });
  });

  test("runs JSON-first BizPulse commands with startup scope", async () => {
    const calls: string[][] = [];
    const client = createBizPulseClient({
      startupId: "startup-1",
      run: async (command) => { calls.push([...command]); return { score: 91, followUps: 2 }; },
    });
    expect(await client.snapshot()).toEqual({ healthScore: 91, followUps: 2 });
    expect(calls[0]).toEqual(["growth", "review", "--startup", "startup-1", "--json"]);
  });

  test("refreshes on demand and exposes the cached snapshot", async () => {
    const coordinator = createPollingCoordinator({ refresh: async () => ({ healthScore: 90, followUps: 1 }) });
    expect(coordinator.snapshot).toBeNull();
    expect(await coordinator.refresh()).toEqual({ healthScore: 90, followUps: 1 });
    expect(coordinator.snapshot?.healthScore).toBe(90);
  });

  test("builds portfolio cockpit navigation and metrics", () => {
    expect(buildCockpitViewModel({ healthScore: 82, followUps: 3 })).toEqual({
      navigation: ["portfolio", "startups", "growth", "crm", "actions"],
      metrics: { healthScore: 82, followUps: 3 },
    });
  });

  test("builds native T3 surface cards from the normalized snapshot", () => {
    const surface = buildSurfaceModel({ healthScore: 82, followUps: 3 });
    expect(surface.pluginId).toBe("com.t3code.bizpulse");
    expect(surface.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "health-score", value: "82" }),
      expect.objectContaining({ id: "follow-ups", value: "3" }),
    ]));
  });
});
