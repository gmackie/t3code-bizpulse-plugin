import { normalizePollingSeconds } from "../bizpulse.ts";
import { toolData } from "./bridge.ts";
import { renderPortfolio, renderPortfolioError, type PortfolioData } from "./render.ts";
import { errorText, mountReview, startView } from "./shared.client.ts";

const root = document.getElementById("app")!;
const bridge = startView("bizpulse-portfolio");
let data: PortfolioData | undefined;
// Set when the latest load failed; any data on screen is then the last good load.
let error: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let review: ReturnType<typeof mountReview> | undefined;

function schedule(seconds: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), seconds * 1000);
}

// Renders the current state and always re-arms the poll, including after a
// failure before anything has loaded.
function draw() {
  if (!data) {
    root.innerHTML = renderPortfolioError(error ?? "BizPulse portfolio failed to load.");
    schedule(normalizePollingSeconds(undefined));
    return;
  }
  // Keep the review pane (and its state) across list refreshes.
  const pane = root.querySelector<HTMLElement>("[data-role=review]");
  root.innerHTML = renderPortfolio(data, error);
  if (pane) root.querySelector("[data-role=review]")!.replaceWith(pane);
  else review = mountReview(bridge, root.querySelector<HTMLElement>("[data-role=review]")!);
  schedule(data.pollSeconds);
}

async function refresh() {
  if (document.visibilityState === "hidden") {
    schedule(5);
    return;
  }
  try {
    data = toolData<PortfolioData>(await bridge.callTool("bizpulse_portfolio", {}));
    error = undefined;
  } catch (cause) {
    error = `Refresh failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  draw();
}

root.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (target?.dataset.action === "refresh") void refresh();
  if (target?.dataset.action === "review" && target.dataset.startupId) void review?.load(target.dataset.startupId);
});

bridge.onToolResult = (result) => {
  if (result.isError) error = errorText(result, "BizPulse portfolio failed to load.");
  else {
    data = toolData<PortfolioData>(result);
    error = undefined;
  }
  draw();
};
// The panel's opening tool delivers the result; fetch if nothing arrives.
void bridge.connect().then(() => setTimeout(() => void (data || error ? undefined : refresh()), 250));
