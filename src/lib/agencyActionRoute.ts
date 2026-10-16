// One action of a signed-in member (routes under /api/comments and /api/deliverables, see src/db/agencyActions.ts):
// the member's agency comes from the session, within the write limit. Cross-site requests are
// refused by src/proxy.ts.

import "server-only";
import { getDb } from "@/db/client";
import { readAgencyAction, runAgencyAction, type ActionParams, type AgencyAction } from "@/db/agencyActions";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { readState } from "@/db/state";
import { databaseFailure, requestOrigin } from "./api";
import { readBody } from "./reviewViewer";
import { requireAgencyUser } from "./session";

export async function agencyActionResponse(request: Request, type: AgencyAction["type"], params: ActionParams = {}) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const body = request.method === "DELETE" ? {} : await readBody(request);
  const action = readAgencyAction(type, body, params);
  if (!action) return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const member = { id: auth.user.id, name: auth.user.name, organizationId: auth.user.organizationId, role: auth.user.role };
    const result = await runAgencyAction(db, member, requestOrigin(request), action);
    if (!result.ok) return Response.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
    // The state after the action comes with the answer: the page needs no second request to show it.
    const fresh = await readState(db, auth.user.organizationId);
    return Response.json({ ...(result.id ? { id: result.id } : {}), ...result.data, revision: fresh.revision, state: fresh.state });
  } catch (error) {
    return databaseFailure(`api ${type}`, error);
  }
}

/** Whether the request body holds `key` (one PATCH route, several actions). */
export async function sends(request: Request, key: string) {
  const body = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null;
  return Boolean(body && typeof body === "object" && key in body);
}
