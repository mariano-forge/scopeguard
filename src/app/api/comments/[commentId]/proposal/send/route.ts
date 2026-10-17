// Agency: POST /api/comments/:commentId/proposal/send -> the drafted quote is sent to the client
// (src/db/agencyActions.ts). Administrators only.

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/comments/[commentId]/proposal/send">) {
  return agencyActionResponse(request, "proposal.send-draft", { commentId: (await context.params).commentId });
}
