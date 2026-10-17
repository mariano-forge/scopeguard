// Client, on one of their remarks (src/db/reviewActions.ts):
//   PATCH  /api/review/:token/comments/:commentId { message }      -> edits it
//   PATCH  /api/review/:token/comments/:commentId { page, x, y }   -> moves its pin
//   DELETE /api/review/:token/comments/:commentId                  -> deletes it, while not qualified

import { reviewActionResponse } from "@/lib/reviewViewer";

type Context = RouteContext<"/api/review/[token]/comments/[commentId]">;

export async function PATCH(request: Request, context: Context) {
  const { token, commentId } = await context.params;
  const moving = "x" in ((await request.clone().json().catch(() => null)) ?? {});
  return reviewActionResponse(request, token, moving ? "comment.move" : "comment.edit", { commentId });
}

export async function DELETE(request: Request, context: Context) {
  const { token, commentId } = await context.params;
  return reviewActionResponse(request, token, "comment.delete", { commentId });
}
