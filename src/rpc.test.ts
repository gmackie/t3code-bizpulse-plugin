import { describe, expect, test } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

describe("BizPulse RPC", () => {
  test("serves the native surface from the cached snapshot", async () => {
    const handler = createRpcHandler({ snapshot: { healthScore: 88, followUps: 2 }, refresh: async () => ({ healthScore: 0, followUps: 0 }) });
    await expect(handler("surface.get", { navigationId: "bizpulse.crm" })).resolves.toMatchObject({ ok: true, result: { pluginId: "com.t3code.bizpulse", navigationId: "bizpulse.crm" } });
  });

  test("serves the portfolio review workflow", async () => {
    const handler = createRpcHandler({ snapshot: { healthScore: 82, followUps: 1 }, refresh: async () => ({ healthScore: 82, followUps: 1 }) });
    await expect(handler("workflow.get", { workflowId: "bizpulse.portfolio-review" })).resolves.toMatchObject({ ok: true, result: { workflowId: "bizpulse.portfolio-review" } });
  });
});
