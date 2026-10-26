// Who receives a proposal: the deciders invited on the version's link, while it is on and not expired.
// Shared by the server, which refuses to send to nobody (src/db/agencyActions.ts), and the send dialog.

import { roleOfInvite } from "./clientRoles";

type LinkData = { active?: unknown; autoExpire?: unknown; expiresAt?: unknown; invites?: unknown };
type LinkInvite = { email: string; role?: unknown };

/** A link's date, a week from now (« jj/mm/aaaa », in Paris): a new link's, and a renewed one's. */
export const linkExpiryFromNow = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/**
 * A link past its date, renewed for a week, its token and invitations kept: the agency shares, invites or
 * reminds on it, so it must open again (the invitations already mailed with it too). As it is otherwise.
 */
export function renewedLink<T extends LinkData>(link: T): T {
  return linkExpired(link) ? { ...link, expiresAt: linkExpiryFromNow() } : link;
}

/** A link past its date (« jj/mm/aaaa », the end of that day); never when it does not expire. */
export function linkExpired(link: LinkData) {
  if (link.autoExpire === false || typeof link.expiresAt !== "string") return false;
  const [day, month, year] = link.expiresAt.split("/").map(Number);
  if (!day || !month || !year) return true;
  return new Date(year, month - 1, day, 23, 59, 59).getTime() < Date.now();
}

export function linkDeciders(link: LinkData | undefined): LinkInvite[] {
  if (!link || link.active !== true || linkExpired(link) || !Array.isArray(link.invites)) return [];
  return (link.invites as LinkInvite[]).filter((invite) => typeof invite?.email === "string" && roleOfInvite(invite) === "decider");
}
