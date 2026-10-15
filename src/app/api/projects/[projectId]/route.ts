// Agency, a project (src/db/workspaceActions.ts):
//   PATCH  /api/projects/:projectId { name }      -> renames it
//   PATCH  /api/projects/:projectId { clientId }  -> moves it to another space
//   DELETE /api/projects/:projectId               -> to the trash with its deliverables (administrators only)

import { agencyActionResponse, sends } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/projects/[projectId]">;

export async function PATCH(request: Request, context: Context) {
  return agencyActionResponse(request, (await sends(request, "clientId")) ? "project.move" : "project.rename", await context.params);
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "project.delete", await context.params);
}
