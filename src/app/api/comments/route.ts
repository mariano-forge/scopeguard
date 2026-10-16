// Agency: POST /api/comments -> { id }, signed with the member (src/db/agencyActions.ts):
//   { deliverableId, message, location?, page?, position?, area?, id? }           a comment on a version
//   { request: { deliverableId, decision, title, description?, quote? } }          a request, already qualified
//   { restore: comment }                                                           a comment put back after its deletion

import { readBody } from "@/lib/reviewViewer";
import { agencyActionResponse } from "@/lib/agencyActionRoute";

export async function POST(request: Request) {
  const body = await readBody(request.clone());
  return agencyActionResponse(request, "request" in body ? "request.create" : "restore" in body ? "comment.restore" : "comment.create");
}
