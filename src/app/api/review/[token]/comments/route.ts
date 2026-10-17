// Client: POST /api/review/:token/comments { message, location?, page?, position?, area?, site?, id? } -> { id }
// A remark on the shared version, signed by the server (src/db/reviewActions.ts). `site`: where it was
// placed on the agency's staging site (src/lib/siteReview.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/comments">) {
  return reviewActionResponse(request, (await context.params).token, "comment.create");
}
