// Agency: POST /api/spaces { name, email?, id? } -> { id }: a client space (src/db/workspaceActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request) {
  return agencyActionResponse(request, "space.create");
}
