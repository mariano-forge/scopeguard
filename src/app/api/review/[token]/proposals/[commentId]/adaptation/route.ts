// Client: POST /api/review/:token/proposals/:commentId/adaptation { message, budget?, deadline? }
// Asks the agency to adapt a sent quote, when it allows it (src/db/reviewActions.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/proposals/[commentId]/adaptation">) {
  const { token, commentId } = await context.params;
  return reviewActionResponse(request, token, "proposal.adapt", { commentId });
}
