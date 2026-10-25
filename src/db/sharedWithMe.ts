// « Partagés avec moi » (/partages): the reviews other agencies invited the signed-in person's own address to,
// as a client. The one read across agencies, by design (decided with the product owner on 25 October 2026):
// keyed by that person's address, verified at sign-up, never by anything the browser sends. It says only what
// their invitation e-mail already told them: the agency, the deliverable and its version, their role, their
// personal link. Never another invitee, a request, an amount, nor anything internal to the agency.

import "server-only";
import { eq, sql } from "drizzle-orm";
import { roleOfInvite, type ClientRole } from "@/lib/clientRoles";
import { linkExpired } from "@/lib/linkDeciders";
import { users } from "./auth-schema";
import type { Db } from "./client";
import { invitesOf, normalizeEmail } from "./reviewAuth";

export type SharedReview = { key: string; agency: string; deliverable: string; version: number; role: ClientRole; href: string };

type Row = { organizationId: string; linkKey: string; link: Record<string, unknown>; agency: string; deliverable: string; version: number };

/** The person's reviews in other agencies than `ownAgencies`, the active and unexpired ones only; none without a verified address. */
export async function reviewsSharedWith(db: Db, userId: string, ownAgencies: string[]): Promise<SharedReview[]> {
  const [user] = await db.select({ email: users.email, verified: users.emailVerified }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.verified) return [];
  const address = normalizeEmail(user.email);
  const result = await db.execute(sql`
    select rl.organization_id as "organizationId", rl.key as "linkKey", rl.data as "link", o.name as "agency", d.name as "deliverable", d.version as "version"
    from review_links rl
    join organizations o on o.id = rl.organization_id
    join deliverables d on d.organization_id = rl.organization_id and d.id = rl.deliverable_id
    where rl.active
      and jsonb_typeof(rl.data->'invites') = 'array'
      and exists (select 1 from jsonb_array_elements(rl.data->'invites') invite where lower(trim(invite->>'email')) = ${address})
    order by o.name, d.name, d.version desc`);
  return (result.rows as Row[])
    .filter((row) => !ownAgencies.includes(row.organizationId) && !linkExpired(row.link))
    .flatMap((row) => {
      const invite = invitesOf(row.link).find((candidate) => normalizeEmail(candidate.email) === address);
      if (!invite || typeof row.link.token !== "string") return [];
      return [
        {
          key: `${row.organizationId}:${row.linkKey}`,
          agency: row.agency,
          deliverable: row.deliverable,
          version: Number(row.version),
          role: roleOfInvite(invite),
          // Their personal link, as in their invitation e-mail (src/db/mailTargets.ts reviewUrl).
          href: `/review/${encodeURIComponent(row.link.token)}${invite.id ? `?invitation=${invite.id}` : ""}`,
        },
      ];
    });
}
