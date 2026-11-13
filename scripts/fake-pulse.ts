#!/usr/bin/env bun
// A stand-in for the BizPulse `pulse` CLI, for tests and `bun run inspect`.
// FAKE_PULSE_MODE=fail prints a pulse-style error and exits 1;
// FAKE_PULSE_MODE=hang never answers; FAKE_PULSE_MODE=garbage prints non-JSON.
const args = process.argv.slice(2);
const mode = process.env.FAKE_PULSE_MODE;

if (mode === "fail") {
  console.error("\x1b[31mError: HTTP 502 from https://bizpulse.example/api/trpc: <html>Bad gateway</html>\x1b[39m");
  process.exit(1);
}
if (mode === "denied") {
  console.error("Error: Not authenticated. Run `pulse login` first.");
  process.exit(1);
}
if (mode === "hang") await new Promise(() => {});
if (mode === "garbage") {
  console.log("Portfolio status");
  process.exit(0);
}

const S1 = "11111111-1111-4111-8111-111111111111";
const key = args.filter((arg) => !arg.startsWith("--") && arg !== S1).join(" ");
const out: Record<string, unknown> = {
  status: {
    opsScores: [
      { startupId: S1, name: "Acme", score: 64, grade: "C", status: "warning" },
      { startupId: "22222222-2222-4222-8222-222222222222", name: "Globex", score: 88, grade: "A", status: "healthy" },
    ],
    startups: [{ id: S1, name: "Acme", urgency: { level: "high", topIssue: "3 failed payments" } }],
    portfolio: { mrr: 1234500, failedPayments: 3, openAlerts: 2, runway: 14 },
  },
  "growth review": {
    headline: "Activation is the bottleneck this week.",
    bottlenecks: [{ area: "activation", title: "Trial users stall at setup", score: 72, source: "posthog" }],
    recommendedActions: [{ title: "Email stalled trials", actionType: "send_email", targetSystem: "twenty", risk: "safe_write" }],
  },
  "crm daily-followups": [{ contactId: "c1", name: "Ada <Lovelace>", company: "Analytical", staleDays: 9, reason: "Proposal sent, no reply", priority: "high" }],
  "actions list": [
    { id: "a1", title: "Email stalled trials", targetSystem: "twenty", actionType: "send_email", risk: "safe_write", status: process.env.FAKE_PULSE_APPROVED ? "approved" : "proposed" },
  ],
  "actions approve a1": { id: "a1", title: "Email stalled trials", targetSystem: "twenty", actionType: "send_email", risk: "safe_write", status: "approved" },
};
if (!(key in out)) {
  console.error(`Error: unknown command ${key}`);
  process.exit(1);
}
console.log(JSON.stringify(out[key], null, 2));
