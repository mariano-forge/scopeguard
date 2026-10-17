// Agency: GET /api/deliverables/:deliverableId/site-key -> { key }
// The fixed key of a « Lien » deliverable for the toolbar's script line (src/lib/siteKey.ts), the same
// for every version. A deliverable of another agency, or not a « Lien », answers 404.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { livrableIdOfVersion } from "@/db/reviewAccess";
import { deliverables } from "@/db/schema";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";
import { siteKeyOf } from "@/lib/siteKey";

const notFound = () => Response.json({ error: "Livrable introuvable" }, { status: 404 });

export async function GET(_request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/site-key">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const deliverableId = Number((await context.params).deliverableId);
  if (!Number.isSafeInteger(deliverableId) || deliverableId <= 0) return notFound();
  try {
    const db = getDb();
    const org = auth.user.organizationId;
    const [record] = await db.select({ data: deliverables.data }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
    if ((record?.data as Record<string, unknown> | undefined)?.type !== "Link") return notFound();
    const livrableId = await livrableIdOfVersion(db, org, deliverableId);
    return livrableId ? Response.json({ key: siteKeyOf(org, livrableId) }) : notFound();
  } catch (error) {
    return databaseFailure("api/deliverables/site-key", error);
  }
}
