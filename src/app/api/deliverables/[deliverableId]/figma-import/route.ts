// Agency: POST /api/deliverables/:deliverableId/figma-import -> { imported, replies }
// The new comments of a « Figma » deliverable's file, brought into its current round (src/db/figmaImport.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/figma-import">) {
  return agencyActionResponse(request, "figma.import", await context.params);
}
