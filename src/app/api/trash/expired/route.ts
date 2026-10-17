// Agency: DELETE /api/trash/expired -> deletes for good what has been in the trash for 30 days
// (administrators only; their page asks for it; src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function DELETE(request: Request) {
  return agencyActionResponse(request, "trash.purge-expired");
}
