import { toolData } from "./bridge.ts";
import { renderCrm, renderStartupPicker, type CrmData } from "./render.ts";
import { errorText, startView } from "./shared.client.ts";

const root = document.getElementById("app")!;
const bridge = startView("bizpulse-crm");
let data: CrmData | undefined;
let startupId: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function show(next: CrmData) {
  data = next;
  startupId = next.startupId;
  root.innerHTML = renderCrm(next);
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), next.pollSeconds * 1000);
}

// Without BIZPULSE_STARTUP_ID the tool asks for a startup; let the user pick one.
function fail(message: string) {
  clearTimeout(timer);
  root.innerHTML = `<header><h1>CRM follow-ups</h1></header>${renderStartupPicker(startupId, message)}`;
}

async function refresh() {
  if (document.visibilityState === "hidden") {
    timer = setTimeout(() => void refresh(), 5000);
    return;
  }
  const result = await bridge.callTool("bizpulse_crm_followups", startupId ? { startupId } : {}).catch((cause: unknown) => ({ isError: true, content: [{ type: "text", text: String(cause instanceof Error ? cause.message : cause) }] }));
  if (result.isError) fail(errorText(result, "CRM follow-ups failed to load."));
  else show(toolData<CrmData>(result));
}

root.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action === "refresh") void refresh();
});
root.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = new FormData(event.target as HTMLFormElement).get("startupId");
  startupId = typeof value === "string" && value.trim() ? value.trim() : undefined;
  void refresh();
});

bridge.onToolInput = (input) => {
  if (typeof input.startupId === "string") startupId = input.startupId;
};
bridge.onToolResult = (result) => {
  if (result.isError) fail(errorText(result, "CRM follow-ups failed to load."));
  else show(toolData<CrmData>(result));
};
void bridge.connect().then(() => setTimeout(() => void (data ? undefined : refresh()), 250));
