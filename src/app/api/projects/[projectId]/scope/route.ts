// Agency, a project's reference scope (src/lib/projectScope.ts, src/db/workspaceActions.ts):
//   PUT /api/projects/:projectId/scope { scope } -> writes it whole (its activation stays the server's)

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function PUT(request: Request, context: RouteContext<"/api/projects/[projectId]/scope">) {
  return agencyActionResponse(request, "project.scope", await context.params);
}
