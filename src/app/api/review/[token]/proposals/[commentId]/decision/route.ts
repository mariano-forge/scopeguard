// Client: POST /api/review/:token/proposals/:commentId/decision { decision: "accepted" | "refused" }
// Decides a sent quote, once (src/db/reviewActions.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/proposals/[commentId]/decision">) {
  const { token, commentId } = await context.params;
  return reviewActionResponse(request, token, "proposal.decide", { commentId });
}
