// Agency: POST /api/comments/:commentId/adaptation/decision { decision: "accepted" | "refused" }
// Answers the client's counter-proposal (src/db/agencyActions.ts). Administrators only.

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/comments/[commentId]/adaptation/decision">) {
  return agencyActionResponse(request, "adaptation.decide", { commentId: (await context.params).commentId });
}
