// Agency, a deliverable: every version of the one :deliverableId belongs to (src/db/workspaceActions.ts):
//   PATCH  /api/deliverables/:deliverableId { name }       -> renames it (refused if its project has that name)
//   PATCH  /api/deliverables/:deliverableId { projectId }  -> moves it to another project
//   DELETE /api/deliverables/:deliverableId                -> to the trash with its requests and quotes

import { agencyActionResponse, sends } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/deliverables/[deliverableId]">;

export async function PATCH(request: Request, context: Context) {
  return agencyActionResponse(request, (await sends(request, "projectId")) ? "livrable.move" : "livrable.rename", await context.params);
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "livrable.delete", await context.params);
}
