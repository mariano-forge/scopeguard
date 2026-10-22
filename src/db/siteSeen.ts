// When Kora's toolbar was last seen on a « Lien » deliverable's staging site: its panel asked for in a
// frame, for that very site (src/app/review/site/[key]/page.tsx). The board's first step says so
// (src/app/(agency)/SiteToolbarSnippet.tsx), so the agency knows its line works. Read by the agency only,
// never sent to the client (readReviewState). A request that only claims to be that frame could mark it
// seen too: what it would change is a line telling the agency the toolbar works.
//
// One setting of the agency, { "<livrableId>": "<ISO time>" }, merged in one statement: two sites seen at
// the same time never overwrite each other, and no deliverable record is rewritten.

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

const key = "siteSeen";
/** Seen again within this time, the panel writes nothing. */
const quietMs = 5 * 60 * 1000;

/** When the toolbar was last seen on the site of the deliverable whose first version is `livrableId`. */
export async function siteSeenAt(db: Db, organizationId: string, livrableId: number) {
  const [row] = await db.select({ value: settings.value }).from(settings).where(and(eq(settings.organizationId, organizationId), eq(settings.key, key))).limit(1);
  const seen = (row?.value as Record<string, unknown> | null | undefined)?.[String(livrableId)];
  return typeof seen === "string" ? seen : null;
}

/** Records that the toolbar was seen on that site now (at most every few minutes). */
export async function markSiteSeen(db: Db, organizationId: string, livrableId: number) {
  const last = await siteSeenAt(db, organizationId, livrableId);
  if (last && Date.now() - new Date(last).getTime() < quietMs) return;
  await db.execute(sql`
    insert into ${settings} (organization_id, key, value)
    values (${organizationId}, ${key}, jsonb_build_object(${String(livrableId)}::text, ${new Date().toISOString()}::text))
    on conflict (organization_id, key) do update set value = coalesce(${settings.value}, '{}'::jsonb) || excluded.value`);
}
