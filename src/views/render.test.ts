import { describe, expect, it } from "bun:test";
import { buildReviewWorkflow } from "../bizpulse.ts";
import { renderCrm, renderPortfolio, renderPortfolioError, renderReview, type ReviewData } from "./render.ts";

const status = {
  opsScores: [{ startupId: "s1", name: "Acme <script>alert(1)</script>", score: 64, grade: "C", status: "warning" }],
  startups: [{ id: "s1", name: "Acme", urgency: { level: "high", topIssue: "3 failed payments" } }],
  portfolio: { mrr: 1234500, failedPayments: 3, openAlerts: 2, runway: null },
};

const action = { id: "a1", title: "Email trials", targetSystem: "twenty", actionType: "send_email", risk: "safe_write", status: "proposed" };
const review = (actions = [action]): ReviewData => ({
  startupId: "s1",
  startupName: "Acme",
  snapshot: { healthScore: 64, followUps: 1 },
  growth: { headline: "Activation <stalls>", bottlenecks: [{ area: "activation", title: "Setup", score: 72, source: "posthog" }], recommendedActions: [] },
  followups: [],
  actions,
  workflow: buildReviewWorkflow({ healthScore: 64, followUps: 1 }, actions),
});

describe("view renderers", () => {
  it("escapes BizPulse content and shows portfolio metrics and alerts", () => {
    const html = renderPortfolio({ ...status, defaultStartupId: "s1", pollSeconds: 60, refreshedAt: "2026-11-13T00:00:00Z" });
    expect(html).toContain("Acme &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("$12,345");
    expect(html).toContain("3 failed payments");
    expect(html).toContain('data-startup-id="s1"');
    expect(html).toContain("(default)");
    expect(html).not.toContain("Runway");
    expect(renderPortfolio({ ...status, opsScores: [], pollSeconds: 60, refreshedAt: "" })).toContain("No startups in this BizPulse workspace.");
  });

  it("marks the portfolio stale when the latest refresh failed", () => {
    const fresh = renderPortfolio({ ...status, pollSeconds: 60, refreshedAt: "2026-11-13T00:00:00Z" });
    expect(fresh).not.toContain('role="alert"');
    const stale = renderPortfolio({ ...status, pollSeconds: 60, refreshedAt: "2026-11-13T00:00:00Z" }, "Refresh failed: <BizPulse> timed out");
    expect(stale).toContain('role="alert"');
    expect(stale).toContain("Refresh failed: &lt;BizPulse&gt; timed out");
    expect(stale).toContain("Last good refresh");
    expect(stale).toContain("Acme &lt;script&gt;");
  });

  it("shows the load error and a refresh control before any portfolio has loaded", () => {
    const html = renderPortfolioError("BizPulse is signed out");
    expect(html).toContain('role="alert"');
    expect(html).toContain("BizPulse is signed out");
    expect(html).toContain('data-action="refresh"');
  });

  it("offers approval only for proposed actions, and disables it while busy", () => {
    const pending = renderReview(review(), { busy: true, error: "BizPulse is temporarily unavailable" });
    expect(pending).toContain('data-action="approve" data-action-id="a1" disabled');
    expect(pending).toContain('role="alert">BizPulse is temporarily unavailable');
    expect(pending).toContain("Activation &lt;stalls&gt;");
    const approved = renderReview(review([{ ...action, status: "approved" }]));
    expect(approved).not.toContain('data-action="approve"');
    expect(approved).toContain("pill-positive");
    expect(renderReview(review([]))).toContain("BizPulse has not proposed any actions.");
  });

  it("lists CRM follow-ups with a startup picker", () => {
    const html = renderCrm({ startupId: "s1", followups: [{ contactId: "c1", name: "Ada <L>", staleDays: 9, reason: "No reply", priority: "high" }], pollSeconds: 60, refreshedAt: "" });
    expect(html).toContain("Ada &lt;L&gt;");
    expect(html).toContain("pill-warning");
    expect(html).toContain('name="startupId" placeholder="BizPulse startup id" value="s1"');
    expect(renderCrm({ startupId: "s1", followups: [], pollSeconds: 60, refreshedAt: "" })).toContain("No CRM follow-ups due.");
  });
});
