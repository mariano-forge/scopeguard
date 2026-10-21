// The key of a « Lien » deliverable in the toolbar's script line (<script … data-site="<key>">): fixed
// for the deliverable, whatever its versions and review links. Kora finds from it the latest version
// shared with an active link (src/app/review/site/[key]/page.tsx), so the agency pastes the line once.
// The link's token no longer appears on the agency's site. Signed by the server, not stored.

import "server-only";
import { readPermanent, signPermanent } from "./signedClaim";

const scope = "site-key";

/** The key of the deliverable whose first version is `livrableId` (src/app/(agency)/routes.ts livrableIdOf). */
export const siteKeyOf = (organizationId: string, livrableId: number) => signPermanent(scope, { o: organizationId, l: livrableId });

/** The deliverable a key names; null for anything not signed by this server. */
export function readSiteKey(value: unknown) {
  const claim = readPermanent<{ o: unknown; l: unknown }>(scope, value);
  return claim && typeof claim.o === "string" && typeof claim.l === "number" && Number.isSafeInteger(claim.l) ? { organizationId: claim.o, livrableId: claim.l } : null;
}
