// Client: POST /api/review/:token/approval -> approves the shared version, which locks it
// (src/db/reviewActions.ts). Cannot be undone.

import { reviewActionResponse } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/approval">) {
  return reviewActionResponse(request, (await context.params).token, "version.approve");
}
