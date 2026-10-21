// Agency: PUT /api/comments/:commentId/closure { closed } -> closes (archives) a discussion, or reopens it.
// Closed, nobody replies until it is reopened; the client still reads it (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function PUT(request: Request, context: RouteContext<"/api/comments/[commentId]/closure">) {
  return agencyActionResponse(request, "comment.close", { commentId: (await context.params).commentId });
}
