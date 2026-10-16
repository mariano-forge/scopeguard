// Client, on one of their replies (src/db/reviewActions.ts):
//   PATCH  /api/review/:token/comments/:commentId/replies/:replyId { message } -> edits it
//   DELETE /api/review/:token/comments/:commentId/replies/:replyId           -> deletes it

import { reviewActionResponse } from "@/lib/reviewViewer";

type Context = RouteContext<"/api/review/[token]/comments/[commentId]/replies/[replyId]">;

export async function PATCH(request: Request, context: Context) {
  const { token, commentId, replyId } = await context.params;
  return reviewActionResponse(request, token, "reply.edit", { commentId, replyId });
}

export async function DELETE(request: Request, context: Context) {
  const { token, commentId, replyId } = await context.params;
  return reviewActionResponse(request, token, "reply.delete", { commentId, replyId });
}
