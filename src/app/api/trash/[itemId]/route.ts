// Agency: DELETE /api/trash/:itemId -> deletes one item for good (administrators only; src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function DELETE(request: Request, context: RouteContext<"/api/trash/[itemId]">) {
  return agencyActionResponse(request, "trash.purge", await context.params);
}
