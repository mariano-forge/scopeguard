// One action of a signed-in member (routes under /api/comments and /api/deliverables, see src/db/agencyActions.ts):
// the member's agency comes from the session, within the write limit. Cross-site requests are
// refused by src/proxy.ts.
//
// From Kora's panel on the staging site, the member's session is the panel's (src/lib/siteAgency.ts):
// only the actions of siteAgencyActions, on the version the panel was opened on. Quotes, counter-
// proposals and sharing answer "do it in Kora": no page of the agency's site may frame them.

import "server-only";
import { getDb, type Db } from "@/db/client";
import { readAgencyAction, runAgencyAction, type ActionParams, type AgencyAction } from "@/db/agencyActions";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { readState } from "@/db/state";
import { and, eq } from "drizzle-orm";
import { comments } from "@/db/schema";
import { siteAgencyMember } from "./siteAgency";
import { siteAgencyActions } from "./siteReview";
import { databaseFailure, requestOrigin } from "./api";
import { readBody } from "./reviewViewer";
import { requireAgencyUser } from "./session";

/** Whether the action touches the version the panel was opened on (a request of it, or a new one on it). */
async function onVersion(db: Db, organizationId: string, deliverableId: number, action: AgencyAction) {
  if ("deliverableId" in action) return action.deliverableId === deliverableId;
  if (!("commentId" in action)) return false;
  const [row] = await db
    .select({ deliverableId: comments.deliverableId })
    .from(comments)
    .where(and(eq(comments.organizationId, organizationId), eq(comments.id, action.commentId)))
    .limit(1);
  return row?.deliverableId === deliverableId;
}

const fromKoraOnly = () =>
  Response.json({ error: "Depuis le site de recette, on commente et on qualifie : les devis et le partage se font dans Kora.", code: "KORA_ONLY" }, { status: 403 });

export async function agencyActionResponse(request: Request, type: AgencyAction["type"], params: ActionParams = {}) {
  const auth = await requireAgencyUser();
  // No Kora session: maybe the panel on the staging site, whose session only opens some actions.
  const site = "response" in auth ? await siteAgencyMember() : null;
  if ("response" in auth && !site) return auth.response;
  if (site && !siteAgencyActions.has(type)) return fromKoraOnly();
  const body = request.method === "DELETE" ? {} : await readBody(request);
  const action = readAgencyAction(type, body, params);
  if (!action) return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const db = getDb();
    const member = site ? site.member : "user" in auth ? { id: auth.user.id, name: auth.user.name, organizationId: auth.user.organizationId, role: auth.user.role } : null;
    if (!member) return Response.json({ error: "Connexion requise" }, { status: 401 });
    if (site && !(await onVersion(db, member.organizationId, site.deliverableId, action))) return Response.json({ error: "Commentaire introuvable." }, { status: 404 });
    if (!(await withinLimit(db, `write:${member.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await runAgencyAction(db, member, requestOrigin(request), action);
    if (!result.ok) return Response.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
    // The panel reads its version through its review link: it fetches it back, rather than the whole agency's.
    if (site) return Response.json({ ...(result.id ? { id: result.id } : {}), ...result.data, revision: result.revision });
    // The state after the action comes with the answer: the page needs no second request to show it.
    const fresh = await readState(db, member.organizationId);
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
