// An agency member in Kora's panel on the staging site (US-048). The panel is a frame from another
// site: the member's Kora session (SameSite=Lax) does not reach it. So:
//
// 1. « Je suis de l'agence » opens a Kora window (/review/:token/site/agence), where that session is
//    there; it gets a ticket for this link (2 minutes) and hands it to the panel, Kora to Kora.
// 2. The panel exchanges it for its own session: a partitioned cookie, kept for the staging site only,
//    for 12 hours, bound to the member, the agency and the shared version.
//
// Both are signed, not stored: membership is read again on every request, so someone removed from the
// agency loses the panel at once. From the panel, the member only does what siteAgencyActions lists:
// decisions on quotes and the validation stay on Kora's pages (AGENTS.md).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { members, users } from "@/db/auth-schema";
import type { AgencyMember } from "@/db/agencyActions";
import type { ReviewAccess } from "@/db/reviewAccess";
import { siteAgencyCookie } from "./siteReview";

const ticketMs = 2 * 60 * 1000;
const sessionMs = 12 * 60 * 60 * 1000;

type Claim = { kind: "ticket" | "session"; userId: string; organizationId: string; deliverableId: number; linkKey: string; expires: number };

function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`site-agency:${payload}`).digest("base64url");
}

function sign(claim: Claim) {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

/** The claim a signed value holds, if the signature is right, it is of `kind` and not expired. */
function read(value: string | undefined, kind: Claim["kind"]): Claim | null {
  if (!value || value.length > 1000) return null;
  const [payload, given] = value.split(".");
  if (!payload || !given) return null;
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claim;
    return claim.kind === kind && typeof claim.expires === "number" && claim.expires > Date.now() ? claim : null;
  } catch {
    return null;
  }
}

const claimFor = (kind: Claim["kind"], userId: string, access: ReviewAccess, lifetime: number): Claim => ({
  kind,
  userId,
  organizationId: access.organizationId,
  deliverableId: access.deliverableId,
  linkKey: access.key,
  expires: Date.now() + lifetime,
});

/** A ticket for this link, handed by the Kora window to the panel. */
export const siteTicket = (userId: string, access: ReviewAccess) => sign(claimFor("ticket", userId, access, ticketMs));

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

/** Exchanges a ticket of this link for the panel's session. False when it is not one, or its member left. */
export async function openSiteAgencySession(ticket: unknown, access: ReviewAccess) {
  const claim = read(typeof ticket === "string" ? ticket : undefined, "ticket");
  if (!claim || claim.linkKey !== access.key || claim.organizationId !== access.organizationId) return false;
  if (!(await memberOf(claim.userId, access.organizationId))) return false;
  const session = claimFor("session", claim.userId, access, sessionMs);
  (await cookies()).set(siteAgencyCookie, sign(session), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
    expires: new Date(session.expires),
  });
  return true;
}

/** The member using the panel, and the version it was opened on; null without a valid session. */
export async function siteAgencyMember(): Promise<{ member: AgencyMember; deliverableId: number; linkKey: string } | null> {
  const claim = read((await cookies()).get(siteAgencyCookie)?.value, "session");
  if (!claim) return null;
  const member = await memberOf(claim.userId, claim.organizationId);
  return member ? { member, deliverableId: claim.deliverableId, linkKey: claim.linkKey } : null;
}
