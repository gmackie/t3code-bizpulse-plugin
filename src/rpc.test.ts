import { describe, expect, test } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

describe("BizPulse RPC", () => {
  test("serves the native surface from the cached snapshot", async () => {
    const handler = createRpcHandler({ snapshot: { healthScore: 88, followUps: 2 }, refresh: async () => ({ healthScore: 0, followUps: 0 }) });
    await expect(handler("surface.get", { navigationId: "bizpulse.crm" })).resolves.toMatchObject({ ok: true, result: { pluginId: "com.t3code.bizpulse", navigationId: "bizpulse.crm" } });
  });
});
