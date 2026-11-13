# T3 Code BizPulse plugin

BizPulse portfolio health, growth bottlenecks, CRM follow-ups and agent actions in T3 Code, as an MCP server with MCP Apps views. It reads BizPulse through the `pulse` CLI's JSON commands, so BizPulse remains the owner of its own credentials and state.

## Install

1. Install the `pulse` CLI and sign in (`pulse login`), or create a BizPulse agent API key.
2. In T3 Code, install this directory as a plugin (manifest `t3-plugin.json`, schema v2) and fill in:

| Variable | Meaning |
|---|---|
| `BIZPULSE_STARTUP_ID` | Default startup for reviews and CRM follow-ups. Tools also take `startupId`. |
| `BIZPULSE_POLL_SECONDS` | View refresh interval, 15–3600 (default 60). |
| `BIZPULSE_COMMAND` | The CLI to run (default `pulse`; use an absolute path if T3 doesn't see your `PATH`). |
| `PULSE_API_URL` | Optional BizPulse endpoint; defaults to the CLI's saved one. |
| `PULSE_API_KEY` | Optional agent API key (secret); defaults to the CLI's saved login. |

## What you get

Panels:

- **Portfolio pulse** (project): ops score, grade, status and top alert per startup, portfolio MRR, alerts and failed payments. Review opens a startup's portfolio review.
- **CRM follow-ups** (thread side panel): today's stale contacts with priority and reason.

Tools for agents and views:

| Tool | Visibility | What it does |
|---|---|---|
| `bizpulse_portfolio` | model, app | Portfolio overview (`pulse status`), renders the portfolio view |
| `bizpulse_portfolio_review` | model, app | Ops score, growth bottlenecks, follow-ups and proposed actions for one startup, renders the review view |
| `bizpulse_crm_followups` | model, app | `pulse crm daily-followups`, renders the CRM view |
| `bizpulse_growth_review` | model, app | `pulse growth review` |
| `bizpulse_actions_list` | model, app | `pulse actions list` |
| `bizpulse_action_approve` | app only | Approves one proposed action in BizPulse. Only a human in the review view can call it. |

When the CLI is missing, signed out, or BizPulse is down, tools return an error result rather than empty data.

See [docs/manifest-v2.md](docs/manifest-v2.md) for the v1 → v2 mapping and what was removed.

## Develop

```sh
bun install
bun test
bun run typecheck
BIZPULSE_COMMAND="bun scripts/fake-pulse.ts" bun run inspect   # MCP Inspector against a fake CLI
```
