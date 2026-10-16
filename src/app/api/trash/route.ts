// Agency: DELETE /api/trash -> empties the trash for good (administrators only; src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function DELETE(request: Request) {
  return agencyActionResponse(request, "trash.purge");
}
