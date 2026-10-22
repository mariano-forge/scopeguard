// Client: GET /api/review/:token/versions -> { versions: [{ version, current, deliverable, comments }] }
// The versions of this deliverable shared with the verified client, the oldest first, to compare them
// (US-053): each one as their page of that version would show it (readReviewState: its file, and only
// the requests they may see). A version not shared with them never appears; a gap in the numbers is
// all their page can tell of it. 404 for anyone but a verified invited client.

import { getDb } from "@/db/client";
import { readReviewState } from "@/db/reviewAccess";
import { sharedVersionsFor } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";

export async function GET(_request: Request, context: RouteContext<"/api/review/[token]/versions">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer || viewer.mode !== "client") return reviewNotFound();
    const db = getDb();
    // One read of the state per shared version: a few at most, and only when the client compares.
    const versions = [];
    for (const access of await sharedVersionsFor(db, viewer.access, viewer.email)) {
      const { state } = await readReviewState(db, access);
      const deliverable = state?.deliverables?.[0];
      if (!deliverable) continue;
      versions.push({ version: access.version, current: access.key === viewer.access.key, deliverable, comments: state?.comments ?? [] });
    }
    return Response.json({ versions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return databaseFailure("api/review/versions", error);
  }
}
