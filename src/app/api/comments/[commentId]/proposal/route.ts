// Agency: POST /api/comments/:commentId/proposal { description, amount, deadline }
// Sends the first quote of an out-of-scope request (src/db/agencyActions.ts). Administrators only.

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/comments/[commentId]/proposal">) {
  return agencyActionResponse(request, "proposal.send", { commentId: (await context.params).commentId });
}
