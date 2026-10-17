// Client: POST /api/review/:token/changes-request { message } -> asks for changes before approving
// (src/db/reviewActions.ts).

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/changes-request">) {
  return reviewActionResponse(request, (await context.params).token, "version.request-changes");
}
