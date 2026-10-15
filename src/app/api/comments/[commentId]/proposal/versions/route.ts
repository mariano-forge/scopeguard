// Agency: POST /api/comments/:commentId/proposal/versions { description, amount, deadline, allowCounter, send }
//   send: true  -> replaces the quote waiting for the client by a new version, sent (administrators only)
//   send: false -> after a refusal, a new quote waiting to be sent
// (src/db/agencyActions.ts)

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/comments/[commentId]/proposal/versions">) {
  return agencyActionResponse(request, "proposal.version", { commentId: (await context.params).commentId });
}
