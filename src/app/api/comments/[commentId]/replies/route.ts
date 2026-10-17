// Agency: POST /api/comments/:commentId/replies { message, id? } -> { id }, signed with the member
// (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/comments/[commentId]/replies">) {
  return agencyActionResponse(request, "reply.create", { commentId: (await context.params).commentId });
}
