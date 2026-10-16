// Agency: POST /api/projects { clientId, name, id? } -> { id }: a project in a space (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request) {
  return agencyActionResponse(request, "project.create");
}
