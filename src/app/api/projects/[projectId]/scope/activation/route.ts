// Agency, the reference of a project's scope, signed by the server (who, when) and written to the journal:
//   POST   /api/projects/:projectId/scope/activation -> the saved scope becomes the project's reference
//   DELETE /api/projects/:projectId/scope/activation -> back to a draft

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/scope/activation">) {
  return agencyActionResponse(request, "project.scope.activate", await context.params);
}

export async function DELETE(request: Request, context: RouteContext<"/api/projects/[projectId]/scope/activation">) {
  return agencyActionResponse(request, "project.scope.deactivate", await context.params);
}
