// Shared state of the agency, for signed-in members (the client page uses /api/review/[token]).
//
//   GET   /api/state?revision=N   -> 204 when the state is still at revision N, else { revision, state }
//   PATCH /api/state              -> applies { changes } (see src/lib/sharedState.ts), returns the new revision

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { applyChanges, currentRevision, readState } from "@/db/state";
import { databaseFailure, readChanges } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

const unauthorized = () => Response.json({ error: "Connexion requise" }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return unauthorized();
  try {
    const db = getDb();
    const known = request.nextUrl.searchParams.get("revision");
    if (known !== null && Number(known) === (await currentRevision(db))) return new Response(null, { status: 204 });
    return Response.json(await readState(db));
  } catch (error) {
    return databaseFailure("api/state", error);
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const changes = await readChanges(request);
  if (!changes) return Response.json({ error: "Corps de requête invalide" }, { status: 400 });

  try {
    return Response.json(await applyChanges(getDb(), changes, { recordedBy: user.id }));
  } catch (error) {
    return databaseFailure("api/state", error);
  }
}
