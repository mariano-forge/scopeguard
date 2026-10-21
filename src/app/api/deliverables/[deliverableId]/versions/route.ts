// Agency: POST /api/deliverables/:deliverableId/versions { type, size, fileData | url, id? } -> { id }
// A new version of the deliverable (a file, or the site's address for a « Lien »); the earlier ones are
// frozen (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/versions">) {
  return agencyActionResponse(request, "version.import", await context.params);
}
