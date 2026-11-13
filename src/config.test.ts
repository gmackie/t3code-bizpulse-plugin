import { describe, expect, it } from "bun:test";
import { cliErrorMessage } from "./cli.ts";
import { loadConfig } from "./config.ts";

describe("config", () => {
  it("maps the v1 settings onto env vars with defaults", () => {
    expect(loadConfig({})).toEqual({ command: ["pulse"], pollSeconds: 60 });
    expect(loadConfig({ BIZPULSE_COMMAND: " bun /opt/pulse.js ", BIZPULSE_STARTUP_ID: " s1 ", BIZPULSE_POLL_SECONDS: "5" })).toEqual({ command: ["bun", "/opt/pulse.js"], startupId: "s1", pollSeconds: 15 });
    expect(loadConfig({ BIZPULSE_POLL_SECONDS: "soon" }).pollSeconds).toBe(60);
  });
});

describe("CLI errors", () => {
  it("keeps the CLI's message but drops URLs, bodies and server errors", () => {
    expect(cliErrorMessage("\x1b[31mError: Startup not found\x1b[39m\n", 1)).toBe("Startup not found");
    expect(cliErrorMessage("Error: Forbidden at https://bizpulse.example/x", 1)).toBe("Forbidden at [url]");
    expect(cliErrorMessage("Error: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", 1)).toBe("BizPulse is temporarily unavailable");
    expect(cliErrorMessage("Error: 503 Service Unavailable", 1)).toBe("BizPulse is temporarily unavailable");
    expect(cliErrorMessage("segfault", 139)).toBe("BizPulse CLI failed (exit 139)");
  });
});
