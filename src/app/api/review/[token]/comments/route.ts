// Client: POST /api/review/:token/comments { message, location?, page?, position?, area?, id? } -> { id }
// A remark on the shared version, signed by the server (src/db/reviewActions.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/comments">) {
  return reviewActionResponse(request, (await context.params).token, "comment.create");
}
