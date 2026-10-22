// Agency: GET /api/deliverables/:deliverableId/site-key -> { key, seenAt }
// The fixed key of a « Lien » deliverable for the toolbar's script line (src/lib/siteKey.ts), the same
// for every version, and when the toolbar was last seen on its site (src/db/siteSeen.ts), or null.
// A deliverable of another agency, or not a « Lien », answers 404.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { livrableIdOfVersion } from "@/db/reviewAccess";
import { siteSeenAt } from "@/db/siteSeen";
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
    return livrableId ? Response.json({ key: siteKeyOf(org, livrableId), seenAt: await siteSeenAt(db, org, livrableId) }, { headers: { "Cache-Control": "private, no-store" } }) : notFound();
  } catch (error) {
    return databaseFailure("api/deliverables/site-key", error);
  }
}
