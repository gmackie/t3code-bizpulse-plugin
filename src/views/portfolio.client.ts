import { toolData } from "./bridge.ts";
import { renderPortfolio, type PortfolioData } from "./render.ts";
import { errorText, mountReview, startView } from "./shared.client.ts";

const root = document.getElementById("app")!;
const bridge = startView("bizpulse-portfolio");
let data: PortfolioData | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let review: ReturnType<typeof mountReview> | undefined;

function draw() {
  if (!data) return;
  // Keep the review pane (and its state) across list refreshes.
  const pane = root.querySelector<HTMLElement>("[data-role=review]");
  root.innerHTML = renderPortfolio(data);
  if (pane) root.querySelector("[data-role=review]")!.replaceWith(pane);
  else review = mountReview(bridge, root.querySelector<HTMLElement>("[data-role=review]")!);
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), data.pollSeconds * 1000);
}

async function refresh() {
  if (document.visibilityState === "hidden") {
    timer = setTimeout(() => void refresh(), 5000);
    return;
  }
  try {
    data = toolData<PortfolioData>(await bridge.callTool("bizpulse_portfolio", {}));
  } catch (cause) {
    const message = `Refresh failed: ${cause instanceof Error ? cause.message : cause}`;
    const status = root.querySelector("header .header-meta span");
    if (status) status.textContent = message;
    else root.textContent = message;
  }
  draw();
}

root.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (target?.dataset.action === "refresh") void refresh();
  if (target?.dataset.action === "review" && target.dataset.startupId) void review?.load(target.dataset.startupId);
});

bridge.onToolResult = (result) => {
  if (result.isError) {
    root.textContent = errorText(result, "BizPulse portfolio failed to load.");
    return;
  }
  data = toolData<PortfolioData>(result);
  draw();
};
// The panel's opening tool delivers the result; fetch if nothing arrives.
void bridge.connect().then(() => setTimeout(() => void (data ? undefined : refresh()), 250));
