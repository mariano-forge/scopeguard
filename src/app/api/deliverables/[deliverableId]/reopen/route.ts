// Agency: POST /api/deliverables/:deliverableId/reopen { message } -> the version's validation is
// reopened (changes requested), the reason kept in the trail (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/reopen">) {
  return agencyActionResponse(request, "version.reopen", await context.params);
}
