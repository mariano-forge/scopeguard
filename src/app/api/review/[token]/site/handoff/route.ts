// POST /api/review/:token/site/handoff -> { ticket }
// A client verified in Kora's panel on the staging site gets a 2-minute ticket for the review page,
// which the panel hands to the tab it opened (src/lib/siteHandoff.ts).

import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";
import { handoffTicket } from "@/lib/siteHandoff";

export async function POST(_request: Request, context: RouteContext<"/api/review/[token]/site/handoff">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    if (viewer.mode !== "client") return Response.json({ error: "Vérification de votre adresse requise" }, { status: 401 });
    return Response.json({ ticket: handoffTicket(viewer.email, viewer.access) });
  } catch (error) {
    return databaseFailure("api/review/site/handoff", error);
  }
}
