import { toolData } from "./bridge.ts";
import type { ReviewData } from "./render.ts";
import { errorText, mountReview, startView } from "./shared.client.ts";

const root = document.getElementById("app")!;
const bridge = startView("bizpulse-portfolio-review");
const review = mountReview(bridge, root);

bridge.onToolResult = (result) => {
  if (result.isError) {
    root.textContent = errorText(result, "Portfolio review failed to load.");
    return;
  }
  review.show(toolData<ReviewData>(result));
};
void bridge.connect();
