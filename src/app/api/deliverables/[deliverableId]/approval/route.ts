// Agency: POST /api/deliverables/:deliverableId/approval -> records the client's approval of the
// version, which locks it (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/approval">) {
  return agencyActionResponse(request, "version.approve", await context.params);
}
