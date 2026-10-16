// Agency, a client space (src/db/workspaceActions.ts):
//   PATCH  /api/spaces/:spaceId { name } -> renames it (its projects keep the new name too)
//   DELETE /api/spaces/:spaceId          -> to the trash with its projects (administrators only)

import { agencyActionResponse } from "@/lib/agencyActionRoute";

type Context = RouteContext<"/api/spaces/[spaceId]">;

export async function PATCH(request: Request, context: Context) {
  return agencyActionResponse(request, "space.rename", await context.params);
}

export async function DELETE(request: Request, context: Context) {
  return agencyActionResponse(request, "space.delete", await context.params);
}
