// Shared state of the signed-in member's agency (the client page uses /api/review/[token]).
//
//   GET   /api/state?revision=N   -> 204 when the state is still at revision N, else { revision, state }
//   PATCH /api/state              -> applies { changes } (see src/lib/sharedState.ts), returns the new revision;
//                                    403 ADMIN_ONLY for a member's change holding a reserved action (src/db/agencyPermissions.ts)

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { canManageAgency, reservedActions } from "@/db/agencyPermissions";
import { applyChanges, currentRevision, readState } from "@/db/state";
import { databaseFailure, readChanges, requestOrigin } from "@/lib/api";
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
    const db = getDb();
    // Members: the whole change is refused when it holds an action reserved to administrators.
    if (!canManageAgency(auth.user.role)) {
      const reserved = await reservedActions(db, auth.user.organizationId, changes);
      if (reserved.length)
        return Response.json({ error: `Réservé aux administrateurs de l’agence : ${reserved.join(", ")}.`, code: "ADMIN_ONLY" }, { status: 403 });
    }
    return Response.json(await applyChanges(db, auth.user.organizationId, changes, { recordedBy: auth.user.id, ...requestOrigin(request) }));
  } catch (error) {
    return databaseFailure("api/state", error);
  }
}
