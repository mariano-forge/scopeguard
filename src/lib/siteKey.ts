// The key in the toolbar's script line (<script … data-site="<key>">). The agency's key, the same for all
// its sites and deliverables: pasted once, before the first deliverable if need be. Kora finds from the
// page's address the deliverable it reviews, then its latest version shared with an active link
// (src/app/review/site/[key]/page.tsx). The key of one deliverable, as the first lines carried, still opens
// that deliverable. The link's token never appears on the agency's site. Signed by the server, not stored.

import "server-only";
import { readPermanent, signPermanent } from "./signedClaim";

const scope = "site-key";

/** The key of the deliverable whose first version is `livrableId` (src/app/(agency)/routes.ts livrableIdOf). */
export const siteKeyOf = (organizationId: string, livrableId: number) => signPermanent(scope, { o: organizationId, l: livrableId });

/** The agency's key: one line for all its staging sites. */
export const agencySiteKeyOf = (organizationId: string) => signPermanent(scope, { o: organizationId });

/** The agency a key names, and its deliverable for a deliverable's key (null: found by the page's address); null for anything not signed by this server. */
export function readSiteKey(value: unknown) {
  const claim = readPermanent<{ o: unknown; l?: unknown }>(scope, value);
  if (!claim || typeof claim.o !== "string") return null;
  if (claim.l === undefined) return { organizationId: claim.o, livrableId: null };
  return typeof claim.l === "number" && Number.isSafeInteger(claim.l) ? { organizationId: claim.o, livrableId: claim.l } : null;
}
