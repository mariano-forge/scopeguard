// Agency: POST /api/deliverables { projectId, name, type, size, fileData?, url?, coverData?, id? } -> { id }
// A new deliverable (version 1); its files are imported first (src/lib/upload.ts). See src/db/workspaceActions.ts.

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request) {
  return agencyActionResponse(request, "livrable.create");
}
