// An agency member in Kora's panel on the staging site (US-048). The panel is a frame from another
// site: the member's Kora session (SameSite=Lax) does not reach it. So the member enters as the
// invited clients do, by the address and a code (src/app/api/review/[token]/access): a verified address
// of a member of the link's agency opens the panel's session instead of a client's. A partitioned
// cookie, kept for the staging site only, for 12 hours, bound to the member, the agency and the shared
// version.
//
// It is signed, not stored: membership and the link are read again on every request, so someone removed
// from the agency, or a link revoked or expired, closes the panel at once. From the panel, the member
// only does what siteAgencyActions lists: decisions on quotes and the validation stay on Kora's pages
// (AGENTS.md).

import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { members, users } from "@/db/auth-schema";
import { reviewLinks } from "@/db/schema";
import type { AgencyMember } from "@/db/agencyActions";
import { expired, type ReviewAccess } from "@/db/reviewAccess";
import { readClaim, signClaim } from "./signedClaim";
import { siteAgencyCookie } from "./siteReview";

const sessionMs = 12 * 60 * 60 * 1000;
const sessionScope = "site-agency-session";

type Claim = { userId: string; organizationId: string; deliverableId: number; linkKey: string };

const claimFor = (userId: string, access: ReviewAccess): Claim => ({ userId, organizationId: access.organizationId, deliverableId: access.deliverableId, linkKey: access.key });

/** The member behind `userId` in the link's agency, with their role; null once they left it. */
async function memberOf(userId: string, organizationId: string): Promise<AgencyMember | null> {
  const [row] = await getDb()
    .select({ name: users.name, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .limit(1);
  return row ? { id: userId, name: row.name, organizationId, role: row.role } : null;
}

/**
 * Whether the link the panel was opened on is still active, unexpired and on the same version: a
 * revoked or expired link closes the panel's session at once, as it does the client's.
 */
async function linkStillOpen(claim: Claim) {
  const [row] = await getDb()
    .select({ active: reviewLinks.active, deliverableId: reviewLinks.deliverableId, data: reviewLinks.data })
    .from(reviewLinks)
    .where(and(eq(reviewLinks.organizationId, claim.organizationId), eq(reviewLinks.key, claim.linkKey)))
    .limit(1);
  const link = row?.data as Record<string, unknown> | undefined;
  return Boolean(row?.active && link?.active === true && !expired(link) && row.deliverableId === claim.deliverableId);
}

/** The member of the link's agency whose account has this address (lower case), or null. */
export async function memberIdByEmail(organizationId: string, email: string) {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, organizationId), eq(users.email, email)))
    .limit(1);
  return row?.id ?? null;
}

/** Opens the panel's session of the member `userId` on this link, once their address is verified. */
export async function openSiteAgencySession(userId: string, access: ReviewAccess) {
  (await cookies()).set(siteAgencyCookie, signClaim(sessionScope, claimFor(userId, access), sessionMs), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
    expires: new Date(Date.now() + sessionMs),
  });
}

/** The member using the panel, and the version it was opened on; null without a valid session. */
export async function siteAgencyMember(): Promise<{ member: AgencyMember; deliverableId: number; linkKey: string } | null> {
  const claim = readClaim<Claim>(sessionScope, (await cookies()).get(siteAgencyCookie)?.value);
  if (!claim || !(await linkStillOpen(claim))) return null;
  const member = await memberOf(claim.userId, claim.organizationId);
  return member ? { member, deliverableId: claim.deliverableId, linkKey: claim.linkKey } : null;
}
