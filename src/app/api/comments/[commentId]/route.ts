// Agency, on a comment (src/db/agencyActions.ts):
//   PATCH  /api/comments/:commentId { message }      -> edits one of the agency's comments
//   PATCH  /api/comments/:commentId { page, x, y }   -> moves its pin
//   DELETE /api/comments/:commentId                  -> deletes one of the agency's comments

import { agencyActionResponse } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/comments/[commentId]">;

export async function PATCH(request: Request, context: Context) {
  const { commentId } = await context.params;
  const moving = "x" in ((await request.clone().json().catch(() => null)) ?? {});
  return agencyActionResponse(request, moving ? "comment.move" : "comment.edit", { commentId });
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "comment.delete", { commentId: (await context.params).commentId });
}
