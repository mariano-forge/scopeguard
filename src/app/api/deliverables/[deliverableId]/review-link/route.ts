// Agency, the client link of a version (src/db/agencyActions.ts):
//   POST   /api/deliverables/:deliverableId/review-link -> { link }: the active link, or a new one (random token)
//   DELETE /api/deliverables/:deliverableId/review-link -> revokes it (administrators only)

import { agencyActionResponse } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/deliverables/[deliverableId]/review-link">;

export async function POST(request: Request, context: Context) {
  return agencyActionResponse(request, "link.share", await context.params);
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "link.revoke", await context.params);
}
