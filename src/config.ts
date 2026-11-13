import { normalizePollingSeconds } from "./bizpulse.ts";
import { parseCommand } from "./cli.ts";

// The v1 settings (bizpulse.startup, bizpulse.polling-seconds) map onto these
// env vars, declared under mcpServer.transport.env in t3-plugin.json.
// PULSE_API_URL and PULSE_API_KEY are read by the pulse CLI itself.
export type BizPulseConfig = {
  readonly command: readonly string[];
  readonly startupId?: string;
  readonly pollSeconds: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): BizPulseConfig {
  const startupId = env.BIZPULSE_STARTUP_ID?.trim();
  const poll = Number(env.BIZPULSE_POLL_SECONDS);
  return {
    command: parseCommand(env.BIZPULSE_COMMAND),
    ...(startupId ? { startupId } : {}),
    pollSeconds: normalizePollingSeconds(env.BIZPULSE_POLL_SECONDS?.trim() && Number.isFinite(poll) ? poll : undefined),
  };
}
