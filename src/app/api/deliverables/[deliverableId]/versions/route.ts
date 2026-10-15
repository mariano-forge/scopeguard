// Agency: POST /api/deliverables/:deliverableId/versions { type, size, fileData, id? } -> { id }
// A new version of the deliverable; the earlier ones are frozen (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/versions">) {
  return agencyActionResponse(request, "version.import", await context.params);
}
