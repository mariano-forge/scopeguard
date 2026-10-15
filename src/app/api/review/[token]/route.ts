// State of one client review. Requires an invited address verified on this device (see
// src/db/reviewAuth.ts); an agency member may read it to preview the client page.
// See src/db/reviewAccess.ts for what the client may read and write.
//
//   GET   /api/review/:token?revision=N   -> 204 if unchanged, else { revision, state } limited to the shared version
//   PATCH /api/review/:token              -> applies the client's allowed changes only

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { readReviewState, sanitizeReviewChanges } from "@/db/reviewAccess";
import { applyChanges, currentRevision } from "@/db/state";
import { databaseFailure, readChanges } from "@/lib/api";
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
    return Response.json(await readReviewState(db, viewer.access));
  } catch (error) {
    return databaseFailure("api/review", error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/review/[token]">) {
  const { token } = await context.params;
  const changes = await readChanges(request);
  if (!changes) return Response.json({ error: "Corps de requête invalide" }, { status: 400 });

  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    if (viewer.mode === "preview") return Response.json({ error: "Aperçu agence : lecture seule" }, { status: 403 });
    if (viewer.mode === "none") return verificationNeeded();
    const db = getDb();
    const allowed = await sanitizeReviewChanges(db, viewer.access, changes, viewer.email);
    const result = allowed
      ? await applyChanges(db, viewer.access.organizationId, allowed, { recordedBy: `client:${viewer.email}` })
      : { revision: await currentRevision(db, viewer.access.organizationId), filesStored: 0 };
    // previousRevision -1: the page always fetches the state back, so what was refused disappears from it.
    return Response.json({ ...result, previousRevision: -1 });
  } catch (error) {
    return databaseFailure("api/review", error);
  }
}
