// Pure HTML renderers shared by the ui:// views (bundled into the browser) and
// the tests. All dynamic text goes through esc().
import { healthTone, type AgentAction, type CrmFollowup, type GrowthReview, type PortfolioStatus, type PortfolioWorkflowModel, type PulseSnapshot } from "../bizpulse.ts";

export type PortfolioData = PortfolioStatus & { defaultStartupId?: string; pollSeconds: number; refreshedAt: string };

export type ReviewData = {
  startupId: string;
  startupName: string;
  snapshot: PulseSnapshot;
  growth: GrowthReview;
  followups: readonly CrmFollowup[];
  actions: readonly AgentAction[];
  workflow: PortfolioWorkflowModel;
};

export type CrmData = { startupId: string; followups: readonly CrmFollowup[]; pollSeconds: number; refreshedAt: string };

export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");
const pill = (label: string, tone: string) => `<span class="pill pill-${esc(tone)}">${esc(label)}</span>`;
// BizPulse reports money in cents.
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

const statusTone: Record<string, string> = { healthy: "positive", ok: "positive", good: "positive", warning: "warning", at_risk: "warning", degraded: "warning", critical: "negative", failing: "negative" };
const priorityTone: Record<string, string> = { critical: "negative", high: "warning", medium: "neutral", low: "muted" };
const actionTone: Record<string, string> = { proposed: "active", draft: "neutral", approved: "positive", executing: "active", completed: "positive", failed: "negative", rejected: "muted", cancelled: "muted" };

const portfolioHeader = (meta: string) => `<header>
  <h1>Portfolio pulse</h1>
  <div class="header-meta"><span>${meta}</span><button type="button" data-action="refresh">Refresh</button></div>
</header>`;

// Shown when the portfolio has never loaded; the view keeps polling.
export function renderPortfolioError(error: string): string {
  return `${portfolioHeader("Not loaded")}
<p class="error" role="alert">${esc(error)}</p>`;
}

// `error` marks the data as stale: the last refresh failed and this is the last good load.
export function renderPortfolio(data: PortfolioData, error?: string): string {
  const alerts = new Map(data.startups.map((item) => [item.id, item.urgency?.level && item.urgency.level !== "ok" ? (item.urgency.topIssue ?? item.urgency.level) : undefined]));
  const rows = data.opsScores.length
    ? data.opsScores
        .map((s) => {
          const alert = alerts.get(s.startupId);
          return `<li class="row">
  <div class="row-main">
    <div class="row-title">${esc(s.name)}${s.startupId === data.defaultStartupId ? ' <span class="count">(default)</span>' : ""}</div>
    <div class="row-meta">${pill(s.status, statusTone[s.status] ?? "neutral")}<span>score ${esc(s.score ?? "—")} · grade ${esc(s.grade)}</span><span class="mono">${esc(s.startupId)}</span></div>
    ${alert ? `<div class="row-detail">${esc(alert)}</div>` : ""}
  </div>
  <button type="button" data-action="review" data-startup-id="${esc(s.startupId)}">Review</button>
</li>`;
        })
        .join("\n")
    : `<li class="empty">No startups in this BizPulse workspace.</li>`;
  const { portfolio } = data;
  return `${portfolioHeader(`${error ? "Last good refresh" : "Refreshed"} ${esc(time(data.refreshedAt))} · every ${esc(data.pollSeconds)}s`)}
${error ? `<p class="error" role="alert">${esc(error)}</p>\n` : ""}<ul class="metrics">
  <li><span class="metric-value">${esc(money(portfolio.mrr))}</span><span class="metric-label">MRR</span></li>
  <li><span class="metric-value ${portfolio.openAlerts ? "tone-warning" : ""}">${esc(portfolio.openAlerts)}</span><span class="metric-label">Open alerts</span></li>
  <li><span class="metric-value ${portfolio.failedPayments ? "tone-negative" : ""}">${esc(portfolio.failedPayments)}</span><span class="metric-label">Failed payments</span></li>
  ${portfolio.runway !== null ? `<li><span class="metric-value">${esc(portfolio.runway)}</span><span class="metric-label">Runway (months)</span></li>` : ""}
</ul>
<section aria-label="Startups"><h2>Startups <span class="count">${data.opsScores.length}</span></h2><ul>${rows}</ul></section>
<div data-role="review"></div>`;
}

const stepIcon: Record<PortfolioWorkflowModel["steps"][number]["state"], string> = { pending: "○", active: "◐", completed: "●", blocked: "◌", failed: "✕" };

export function renderReview(data: ReviewData, options: { busy?: boolean; error?: string } = {}): string {
  const { workflow, growth, snapshot } = data;
  const steps = workflow.steps
    .map(
      (step) => `<li class="step step-${esc(step.state)}"><span class="step-icon" aria-hidden="true">${stepIcon[step.state]}</span><div><div class="row-title">${esc(step.title)}</div>${step.detail ? `<div class="row-detail">${esc(step.detail)}</div>` : ""}</div><span class="sr">${esc(step.state)}</span></li>`,
    )
    .join("\n");
  const bottlenecks = growth.bottlenecks
    .map((b) => `<li class="row"><div class="row-main"><div class="row-title">${esc(b.title)}</div><div class="row-meta">${pill(b.area, "neutral")}<span>score ${esc(b.score)}</span><span>${esc(b.source)}</span></div>${b.summary ? `<div class="row-detail">${esc(b.summary)}</div>` : ""}</div></li>`)
    .join("\n");
  const actions = data.actions
    .map((a) => {
      const pending = a.status === "proposed" || a.status === "draft";
      return `<li class="row"><div class="row-main"><div class="row-title">${esc(a.title)}</div><div class="row-meta">${pill(a.status, actionTone[a.status] ?? "neutral")}<span>${esc(a.targetSystem)}:${esc(a.actionType)}</span><span>risk ${esc(a.risk)}</span></div></div>${
        pending ? `<button type="button" class="primary" data-action="approve" data-action-id="${esc(a.id)}" ${options.busy ? "disabled" : ""}>Approve</button>` : ""
      }</li>`;
    })
    .join("\n");
  return `<header>
  <h1>${esc(workflow.title)}: ${esc(data.startupName)}</h1>
  <div class="header-meta"><span>Stage: <strong>${esc(workflow.currentStage)}</strong></span><button type="button" data-action="refresh-review" ${options.busy ? "disabled" : ""}>Refresh</button></div>
</header>
<p class="subject">${pill(`ops score ${snapshot.healthScore ?? "unknown"}`, healthTone(snapshot.healthScore))}${pill(`${snapshot.followUps} follow-ups`, snapshot.followUps ? "warning" : "positive")}<span class="mono">${esc(data.startupId)}</span></p>
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ""}
<ol class="steps">${steps}</ol>
<section aria-label="Growth"><h2>Growth</h2><p class="subject">${esc(growth.headline)}</p>${bottlenecks ? `<ul>${bottlenecks}</ul>` : ""}</section>
<section aria-label="Actions"><h2>BizPulse actions <span class="count">${data.actions.length}</span></h2><ul>${actions || `<li class="empty">BizPulse has not proposed any actions.</li>`}</ul></section>`;
}

export function renderCrm(data: CrmData): string {
  const rows = data.followups.length
    ? data.followups
        .map(
          (f) => `<li class="row"><div class="row-main"><div class="row-title">${esc(f.name)}${f.company ? ` <span class="count">${esc(f.company)}</span>` : ""}</div><div class="row-meta">${pill(f.priority, priorityTone[f.priority] ?? "neutral")}<span>${esc(f.staleDays)}d since contact</span>${f.email ? `<span>${esc(f.email)}</span>` : ""}</div>${f.reason ? `<div class="row-detail">${esc(f.reason)}</div>` : ""}</div></li>`,
        )
        .join("\n")
    : `<li class="empty">No CRM follow-ups due.</li>`;
  return `<header>
  <h1>CRM follow-ups</h1>
  <div class="header-meta"><span>Refreshed ${esc(time(data.refreshedAt))} · every ${esc(data.pollSeconds)}s</span><button type="button" data-action="refresh">Refresh</button></div>
</header>
${renderStartupPicker(data.startupId)}
<section aria-label="Follow-ups"><h2>Due today <span class="count">${data.followups.length}</span></h2><ul>${rows}</ul></section>`;
}

export function renderStartupPicker(startupId = "", error?: string): string {
  return `<form class="actions" data-role="startup">
  <label class="field">Startup <input name="startupId" placeholder="BizPulse startup id" value="${esc(startupId)}" autocomplete="off"></label>
  <button type="submit">Load</button>
</form>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}`;
}

export const STYLES = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #656d76; --bg: transparent; --line: #d0d7de; --accent: #0969da; --pos: #1a7f37; --neg: #cf222e; --warn: #9a6700; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
:root[data-theme="dark"] { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; --warn: #d29922; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; --warn: #d29922; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; color: var(--fg); background: var(--bg); }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 16px 0 6px; }
.header-meta { display: flex; gap: 8px; align-items: center; color: var(--muted); }
ul, ol { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.row-main { flex: 1; min-width: 0; } .row-title { font-weight: 500; overflow-wrap: anywhere; }
.row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; margin-top: 2px; }
.row-detail { color: var(--muted); font-size: 12px; margin-top: 2px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.count { font-weight: 400; } .empty { color: var(--muted); padding: 8px 0; border-top: 1px solid var(--line); }
.pill { border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 17px; }
.pill-active { color: var(--accent); } .pill-positive { color: var(--pos); } .pill-negative { color: var(--neg); } .pill-warning { color: var(--warn); } .pill-neutral, .pill-muted { color: var(--muted); }
button { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); } button:disabled { opacity: .5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
input { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
input[type="search"] { width: 100%; margin-top: 10px; }
.steps { margin-top: 10px; } .step { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; }
.step-icon { width: 14px; text-align: center; color: var(--muted); } .step-active .step-icon { color: var(--accent); } .step-completed .step-icon { color: var(--pos); } .step-failed .step-icon { color: var(--neg); }
.step-pending .row-title { color: var(--muted); font-weight: 400; }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; flex-wrap: wrap; } .field { display: flex; gap: 6px; align-items: center; color: var(--muted); }
.subject { margin: 6px 0 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.error { color: var(--neg); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.metrics { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0 0; } .metrics li { display: flex; flex-direction: column; } .metric-value { font-size: 18px; font-weight: 600; } .metric-label { color: var(--muted); font-size: 11px; } .tone-warning { color: var(--warn); } .tone-negative { color: var(--neg); }
form.actions { margin-top: 10px; }
[data-role="review"]:not(:empty) { margin-top: 16px; padding-top: 4px; border-top: 2px solid var(--line); }
`;
