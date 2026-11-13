# BizPulse manifest v2 (T3CODE-75)

`t3-plugin.json` follows the MCP-native plugin design approved on T3CODE-74, as piloted by the Bob plugin. T3 loads this manifest into its server-owned MCP registry.

## Shape

- `mcpServer` reuses `McpServerConfig` and `McpServerVariable` from Settings → Tools (`packages/contracts/src/agentTools.ts`):
  - `name`: `bizpulse`.
  - `transport`: stdio, `bun ${pluginRoot}/src/mcp.ts`, with `env` as `McpServerVariable[]`. `PULSE_API_KEY` is `sensitive`.
- The server reads BizPulse through the `pulse` CLI's JSON commands (`pulse status --json`, `pulse growth review --startup <id> --json`, …). The CLI keeps its own login (`pulse login`, or `PULSE_API_KEY`), so BizPulse stays the owner of its credentials. Each CLI call is bounded to 15s, and server-side failures (5xx, HTML bodies, network errors) collapse to "BizPulse is temporarily unavailable" without URLs or response bodies.
- `contributes.panels[]`:
  - `bizpulse-portfolio` (`scope: project`) renders `ui://bizpulse/portfolio.html` and opens with `bizpulse_portfolio`. Its Review buttons open the portfolio review inline.
  - `bizpulse-crm` (`scope: thread`) renders `ui://bizpulse/crm.html`: today's CRM follow-ups for `BIZPULSE_STARTUP_ID`, or a startup picker when none is set.
- `contributes.commands[]` open those panels.
- `t3Tools` is `[]`: BizPulse never calls back into T3, and v1 granted no T3 capability.

## v1 → v2 mapping

The v1 manifest's last version is at commit 5127ba5.

| v1 | v2 |
|---|---|
| `runtime` (managed-app, `bun src/stdio.ts`, `surface.get`/`workflow.get` RPC) | `mcpServer.transport` (stdio, `bun ${pluginRoot}/src/mcp.ts`) |
| `navigation[bizpulse.portfolio]`, `navigation[bizpulse.startups]` | Tool `bizpulse_portfolio` (ops score, grade, status and top alert per startup) and the `bizpulse-portfolio` panel |
| `navigation[bizpulse.growth]` | Tool `bizpulse_growth_review` |
| `navigation[bizpulse.crm]` | Tool `bizpulse_crm_followups` and the `bizpulse-crm` panel |
| `navigation[bizpulse.actions]` | Tool `bizpulse_actions_list` |
| `panels[bizpulse.portfolio]` (project) | `panels[bizpulse-portfolio]`, `scope: project` |
| `panels[bizpulse.crm]` (thread.sidePanel) | `panels[bizpulse-crm]`, `scope: thread` |
| `workflows[bizpulse.portfolio-review]` (thread.main) | Tool `bizpulse_portfolio_review` with its own view `ui://bizpulse/portfolio-review.html` |
| Workflow action `approve` | Tool `bizpulse_action_approve`, `visibility: ["app"]` (see below) |
| `settings[bizpulse.startup]` | `BIZPULSE_STARTUP_ID` (every startup tool also takes `startupId`) |
| `settings[bizpulse.polling-seconds]` | `BIZPULSE_POLL_SECONDS`, clamped to 15–3600; the views refresh on that interval |
| `T3_PLUGIN_COMMAND` (runtime env) | `BIZPULSE_COMMAND`, default `pulse` |
| `settingsPanels[bizpulse.connection]` | The variables' `title`/`description` on the install form |
| `capabilities: network.connect (bizpulse.forgegraf.com)` | Dropped: the server process (through the CLI) makes the network calls. `PULSE_API_URL` overrides the CLI's endpoint |
| `capabilities: ui.embed` | Implied by `panels` |
| `capabilities: filesystem.read (project.root)` | Dropped: no v1 code read the project, and nothing needs it |
| `hooks: turn.settled, runtime.error` | Removed (see below) |

## Removed v1 behaviour

- **Hooks.** v1 subscribed to `turn.settled` and `runtime.error` but never handled them; the runtime only refreshed its own snapshot. v2 has no hooks (T3CODE-74 D4). Views refresh on `BIZPULSE_POLL_SECONDS` and on Refresh, and every tool reads BizPulse afresh, so there is nothing to replace.
- **In-process snapshot cache and polling coordinator** (`createPollingCoordinator`, `T3_PLUGIN_SNAPSHOT`). T3 runs one stdio copy per agent session plus one in its pool, so a process cache would disagree between copies. Every call reads BizPulse; no state is persisted.
- **Placeholder data.** v1 served `{ healthScore: null, followUps: 0 }` when no CLI was configured. v2 returns a tool error instead (missing CLI, signed-out CLI, missing startup).
- **Local-only approval.** v1's "Approve operator response" flipped an in-memory flag and touched nothing in BizPulse. v2's review lists BizPulse's real proposed agent actions and approves each one in BizPulse (`pulse actions approve`). Executing approved actions stays in BizPulse; the plugin does not expose `pulse actions execute`.
- **Native surface cards** (`buildSurfaceModel`, `buildCockpitViewModel`). T3's native card renderer is gone; the `ui://` views replace it.

## Server rules from the design

- **Visibility.** Every tool a view calls declares `_meta.ui.visibility` including `"app"`:
  - `bizpulse_portfolio`, `bizpulse_portfolio_review`, `bizpulse_crm_followups`, `bizpulse_growth_review` and `bizpulse_actions_list` are `["model", "app"]`.
  - `bizpulse_action_approve` is `["app"]`, so only a human in the review view can approve a BizPulse action.
- **No T3 token needed.** Only the pool copy gets `T3_MCP_URL`/`T3_MCP_TOKEN`; BizPulse ignores them, so its tools behave the same in every copy.
- **Stateless processes.** No state file; BizPulse owns all state.

## Open questions

1. **CLI on PATH.** The default `BIZPULSE_COMMAND=pulse` relies on T3 spawning plugins with the user's `PATH`. If it doesn't, set an absolute path.
2. **Thread context.** The CRM panel is thread-scoped as in v1, but BizPulse has no notion of a T3 thread; it shows the configured startup in every thread.
3. **Startup per project.** v1's `bizpulse.startup` was project-scoped. v2 variables are per install, so a different startup per project needs `startupId` per call or the picker.
