// Agency: POST /api/trash/:itemId/restore -> puts everything back as it was (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/trash/[itemId]/restore">) {
  return agencyActionResponse(request, "trash.restore", await context.params);
}
