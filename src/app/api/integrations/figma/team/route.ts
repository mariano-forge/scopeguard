// Agency: PUT /api/integrations/figma/team { figmaUserId, handle, member } -> { removed }
// A person of Figma marked as the agency's team, or the client's again (src/db/figmaImport.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function PUT(request: Request) {
  return agencyActionResponse(request, "figma.team");
}
