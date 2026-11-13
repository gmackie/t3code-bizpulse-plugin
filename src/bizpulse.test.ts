import { describe, expect, test } from "bun:test";
import { buildReviewWorkflow, createBizPulseClient, normalizeActions, normalizeFollowups, normalizeGrowthReview, normalizePollingSeconds, normalizePortfolioStatus, normalizePulseSnapshot } from "./bizpulse.ts";

describe("BizPulse adapter", () => {
  test("normalizes growth and CRM evidence into a plugin snapshot", () => {
    expect(normalizePulseSnapshot({ growth: { score: 82 }, crm: { followUps: 3 } })).toEqual({ healthScore: 82, followUps: 3 });
    expect(normalizePulseSnapshot({ opsScore: { score: 64 }, followups: [{}, {}] })).toEqual({ healthScore: 64, followUps: 2 });
    expect(normalizePulseSnapshot({})).toEqual({ healthScore: null, followUps: 0 });
  });

  test("runs JSON-first BizPulse commands with startup scope", async () => {
    const calls: string[][] = [];
    const client = createBizPulseClient({
      run: async (command) => {
        calls.push([...command]);
        return command[0] === "growth" ? { headline: "Up", bottlenecks: [], recommendedActions: [] } : [];
      },
    });
    expect((await client.growthReview("startup-1")).headline).toBe("Up");
    await client.followups("startup-1");
    await client.actions("startup-1");
    await client.approveAction("a1").catch(() => undefined);
    expect(calls).toEqual([
      ["growth", "review", "--startup", "startup-1", "--json"],
      ["crm", "daily-followups", "--startup", "startup-1", "--json"],
      ["actions", "list", "--startup", "startup-1", "--json"],
      ["actions", "approve", "a1", "--json"],
    ]);
  });

  test("tolerates partial CLI output instead of inventing values", () => {
    expect(normalizePortfolioStatus({ opsScores: [{ startupId: "s1", name: "Acme" }] })).toEqual({
      opsScores: [{ startupId: "s1", name: "Acme", score: null, grade: "—", status: "unknown" }],
      startups: [],
      portfolio: { mrr: 0, failedPayments: 0, openAlerts: 0, runway: null },
    });
    expect(normalizeGrowthReview(null)).toEqual({ headline: "No growth review headline.", bottlenecks: [], recommendedActions: [] });
    expect(normalizeFollowups({ not: "a list" })).toEqual([]);
    expect(normalizeActions([{ id: "a1" }])).toEqual([{ id: "a1", title: "", targetSystem: "", actionType: "", risk: "", status: "unknown" }]);
  });

  test("clamps the refresh interval", () => {
    expect(normalizePollingSeconds(undefined)).toBe(60);
    expect(normalizePollingSeconds(1)).toBe(15);
    expect(normalizePollingSeconds(99_999)).toBe(3600);
  });

  test("builds a portfolio review workflow from growth, CRM and action evidence", () => {
    const proposed = { id: "a1", title: "Email trials", targetSystem: "twenty", actionType: "send_email", risk: "safe_write", status: "proposed" };
    const review = buildReviewWorkflow({ healthScore: 62, followUps: 4 }, [proposed]);
    expect(review.currentStage).toBe("review");
    expect(review.evidence?.[0]?.status).toBe("warning");
    expect(review.actions).toEqual([{ id: "approve:a1", title: "Approve: Email trials", tone: "primary" }]);

    const executing = buildReviewWorkflow({ healthScore: 90, followUps: 0 }, [{ ...proposed, status: "approved" }]);
    expect(executing.currentStage).toBe("execute");
    expect(executing.actions).toEqual([]);
    expect(executing.evidence?.[0]?.status).toBe("positive");

    expect(buildReviewWorkflow({ healthScore: 90, followUps: 0 }, [{ ...proposed, status: "completed" }]).currentStage).toBe("verify");
    expect(buildReviewWorkflow({ healthScore: null, followUps: 0 }).currentStage).toBe("propose");
  });
});
