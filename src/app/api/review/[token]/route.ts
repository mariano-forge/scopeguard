// State of one client review. Requires an invited address verified on this device (see
// src/db/reviewAuth.ts); an agency member may read it to preview the client page.
// See src/db/reviewAccess.ts for what the client may read; an agency member in the panel on the
// staging site reads every request of the version (readSiteAgencyState).
//
//   GET /api/review/:token?revision=N   -> 204 if unchanged, else { revision, state } limited to the shared version
//
// The client writes one action at a time, through the routes below this one (src/db/reviewActions.ts).

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { readReviewState, readSiteAgencyState } from "@/db/reviewAccess";
import { currentRevision } from "@/db/state";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";

const verificationNeeded = () => Response.json({ error: "Vérification de votre adresse requise" }, { status: 401 });

export async function GET(request: NextRequest, context: RouteContext<"/api/review/[token]">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    if (viewer.mode === "none") return verificationNeeded();
    const db = getDb();
    const known = request.nextUrl.searchParams.get("revision");
    if (known !== null && Number(known) === (await currentRevision(db, viewer.access.organizationId))) return new Response(null, { status: 204 });
    // An agency member in the panel on the staging site sees its own pins too (src/lib/siteAgency.ts).
    return Response.json(viewer.mode === "agency" ? await readSiteAgencyState(db, viewer.access) : await readReviewState(db, viewer.access));
  } catch (error) {
    return databaseFailure("api/review", error);
  }
}
