// Client: POST /api/review/:token/comments/:commentId/replies { message, id? } -> { id }
// A reply in any thread of the shared version, signed by the server (src/db/reviewActions.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/comments/[commentId]/replies">) {
  const { token, commentId } = await context.params;
  return reviewActionResponse(request, token, "reply.create", { commentId });
}
