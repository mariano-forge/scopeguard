// Shared state of the signed-in member's agency (the client page uses /api/review/[token]).
//
//   GET /api/state?revision=N   -> 204 when the state is still at revision N, else { revision, state }
//
// Read only: every write of the agency has its own route (src/db/agencyActions.ts, workspaceActions.ts).

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { currentRevision, readState } from "@/db/state";
import { databaseFailure } from "@/lib/api";
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
