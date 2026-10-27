// Agency: PUT /api/comments/:commentId/payment { paid } -> marks an accepted proposal paid, or not any more.
// Reserved to administrators; the agency's own follow-up, never shown to the client (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function PUT(request: Request, context: RouteContext<"/api/comments/[commentId]/payment">) {
  return agencyActionResponse(request, "proposal.paid", { commentId: (await context.params).commentId });
}
