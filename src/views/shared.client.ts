import { createViewBridge, toolData, type CallToolResult, type HostContext, type ViewBridge } from "./bridge.ts";
import { esc, renderReview, type ReviewData } from "./render.ts";

// host-context-changed may carry only the changed fields, so merge them.
export function startView(name: string, onContext?: (context: HostContext, previous: HostContext) => void): ViewBridge {
  const bridge = createViewBridge(window as never, { name, version: "0.4.0" });
  let context: HostContext = {};
  bridge.onHostContext = (update) => {
    const previous = context;
    context = { ...context, ...update };
    if (context.theme) document.documentElement.dataset.theme = context.theme;
    onContext?.(context, previous);
  };
  new ResizeObserver(() => bridge.sendSize(document.documentElement.scrollWidth, document.documentElement.scrollHeight)).observe(document.body);
  return bridge;
}

export const errorText = (result: CallToolResult, fallback: string) => result.content?.find((part) => part.type === "text")?.text ?? fallback;

// Portfolio review controller, shared by the standalone review view and the
// inline review pane of the portfolio view.
export function mountReview(bridge: ViewBridge, root: HTMLElement) {
  let data: ReviewData | undefined;
  let busy = false;
  let error: string | undefined;

  const draw = () => {
    if (data) root.innerHTML = renderReview(data, { busy, ...(error ? { error } : {}) });
    else if (error) root.innerHTML = `<p class="error" role="alert">${esc(error)}</p>`;
    else if (busy) root.innerHTML = `<p class="row-detail">Loading portfolio review…</p>`;
  };
  const run = async (task: () => Promise<void>) => {
    busy = true;
    error = undefined;
    draw();
    try {
      await task();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    busy = false;
    draw();
  };
  const load = (startupId: string) =>
    run(async () => {
      data = toolData<ReviewData>(await bridge.callTool("bizpulse_portfolio_review", { startupId }));
    });

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target || !data || busy) return;
    const startupId = data.startupId;
    if (target.dataset.action === "refresh-review") void load(startupId);
    const actionId = target.dataset.actionId;
    if (target.dataset.action === "approve" && actionId)
      void run(async () => {
        toolData(await bridge.callTool("bizpulse_action_approve", { actionId }));
        data = toolData<ReviewData>(await bridge.callTool("bizpulse_portfolio_review", { startupId }));
      });
  });

  return {
    show(next: ReviewData) {
      data = next;
      error = undefined;
      draw();
    },
    load,
  };
}
