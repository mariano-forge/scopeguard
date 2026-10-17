// Agency, on one of its replies (src/db/agencyActions.ts):
//   PATCH  /api/comments/:commentId/replies/:replyId { message } -> edits it
//   DELETE /api/comments/:commentId/replies/:replyId           -> deletes it

import { agencyActionResponse } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/comments/[commentId]/replies/[replyId]">;

export async function PATCH(request: Request, context: Context) {
  return agencyActionResponse(request, "reply.edit", await context.params);
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "reply.delete", await context.params);
}
