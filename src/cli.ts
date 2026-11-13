import type { CommandRunner } from "./bizpulse.ts";

export const CLI_TIMEOUT_MS = 15_000;

export class BizPulseCliError extends Error {}

// Runs the BizPulse `pulse` CLI with `--json`. The CLI keeps its own login
// (~/.pulse/config.json or PULSE_API_KEY), so the plugin never sees a session.
export function createCliRunner(options: { command: readonly string[]; env?: Record<string, string | undefined>; timeoutMs?: number }): CommandRunner {
  const timeoutMs = options.timeoutMs ?? CLI_TIMEOUT_MS;
  return async (args) => {
    const [bin, ...prefix] = options.command;
    if (!bin) throw new BizPulseCliError("No BizPulse CLI configured: set BIZPULSE_COMMAND to the pulse CLI (e.g. pulse or /path/to/pulse)");
    let child: ReturnType<typeof Bun.spawn>;
    try {
      child = Bun.spawn([bin, ...prefix, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: childEnv(options.env ?? process.env) });
    } catch {
      throw new BizPulseCliError(`BizPulse CLI "${bin}" was not found: install the pulse CLI or set BIZPULSE_COMMAND to its path`);
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout as ReadableStream).text(), new Response(child.stderr as ReadableStream).text(), child.exited]);
      if (timedOut) throw new BizPulseCliError(`BizPulse did not answer within ${Math.ceil(timeoutMs / 1000)}s`);
      if (code !== 0) throw new BizPulseCliError(cliErrorMessage(stderr, code));
      try {
        return JSON.parse(stdout) as unknown;
      } catch {
        throw new BizPulseCliError("BizPulse CLI returned output that is not JSON");
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

// Empty variables from the plugin form must not shadow the CLI's own config.
function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (value) out[key] = value;
  return out;
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** A short, user-facing message from the CLI's stderr, without URLs or response bodies. */
export function cliErrorMessage(stderr: string, code: number | null): string {
  const line = stderr.replace(ANSI, "").split("\n").map((part) => part.trim()).find((part) => part.startsWith("Error:"))?.slice("Error:".length).trim();
  if (!line) return `BizPulse CLI failed (exit ${code ?? "signal"})`;
  if (/\b5\d\d\b|<html|<!doctype|fetch failed|ECONNREFUSED|ENOTFOUND|socket|Unexpected token/i.test(line)) return "BizPulse is temporarily unavailable";
  const clean = line.replace(/https?:\/\/\S+/g, "[url]");
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

export function parseCommand(raw: string | undefined): string[] {
  return (raw?.trim() || "pulse").split(/\s+/u).filter(Boolean);
}
