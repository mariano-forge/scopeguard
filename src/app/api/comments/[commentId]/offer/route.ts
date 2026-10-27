// Agency: DELETE /api/comments/:commentId/offer -> takes back the offer of an out-of-scope request, prepared or
// sent (src/lib/requestOffer.ts): the request is to answer again. An offer is prepared with the qualification
// (PUT …/qualification { offer }) and sent as a quote is (POST …/proposal/send). Taking back one sent is the
// administrators' (src/db/agencyPermissions.ts); never from the staging site's panel (src/lib/siteReview.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function DELETE(request: Request, context: RouteContext<"/api/comments/[commentId]/offer">) {
  return agencyActionResponse(request, "proposal.unoffer", { commentId: (await context.params).commentId });
}
