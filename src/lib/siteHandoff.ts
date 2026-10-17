// From Kora's panel on the staging site to the review page, without a second code. The client's
// session in the panel is kept for the staging site only (partitioned); the review page, opened in a
// tab of its own, needs the usual one. The panel opens that tab (/review/:token/site/ouvrir), then
// hands it a ticket (2 minutes, this address and link), Kora window to Kora window: the tab exchanges
// it for the usual session. Quotes and the validation are decided there (AGENTS.md).

import "server-only";
import type { ReviewAccess } from "@/db/reviewAccess";
import { isInvited } from "@/db/reviewAuth";
import { readClaim, signClaim } from "./signedClaim";

const scope = "site-client-handoff";
const ticketMs = 2 * 60 * 1000;

/** A ticket for the verified `email` on this link. */
export const handoffTicket = (email: string, access: ReviewAccess) => signClaim(scope, { email, linkKey: access.key }, ticketMs);

/** The address a ticket of this link was given to, while it is still invited; null otherwise. */
export function handoffEmail(ticket: unknown, access: ReviewAccess) {
  const claim = readClaim<{ email: string; linkKey: string }>(scope, ticket);
  return claim && claim.linkKey === access.key && typeof claim.email === "string" && isInvited(access.link, claim.email) ? claim.email : null;
}
