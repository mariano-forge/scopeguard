// Shared state of the signed-in member's agency (the client page uses /api/review/[token]).
//
//   GET   /api/state?revision=N   -> 204 when the state is still at revision N, else { revision, state }
//   PATCH /api/state              -> applies { changes } (see src/lib/sharedState.ts), returns the new revision

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { applyChanges, currentRevision, readState } from "@/db/state";
import { databaseFailure, readChanges } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const org = auth.user.organizationId;
  try {
    const db = getDb();
    const known = request.nextUrl.searchParams.get("revision");
    if (known !== null && Number(known) === (await currentRevision(db, org))) return new Response(null, { status: 204 });
    return Response.json(await readState(db, org));
  } catch (error) {
    return databaseFailure("api/state", error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const changes = await readChanges(request);
  if (!changes) return Response.json({ error: "Corps de requête invalide" }, { status: 400 });

  try {
    return Response.json(await applyChanges(getDb(), auth.user.organizationId, changes, { recordedBy: auth.user.id }));
  } catch (error) {
    return databaseFailure("api/state", error);
  }
}
