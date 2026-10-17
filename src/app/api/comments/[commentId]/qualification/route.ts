// Agency: PUT /api/comments/:commentId/qualification { decision, title?, description?, quote? }
// "Inclus" (to do) or "Hors périmètre" (to quote, with an optional draft quote), or back to
// "À qualifier" (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function PUT(request: Request, context: RouteContext<"/api/comments/[commentId]/qualification">) {
  return agencyActionResponse(request, "comment.qualify", { commentId: (await context.params).commentId });
}
