// Who an e-mail about a review goes to, and the address it opens: shared by the access e-mails
// (reviewAuth.ts) and the quote and decision e-mails (reviewMails.ts).

import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { appUrl } from "@/lib/mail";
import type { Db } from "./client";
import { deliverables, members, users } from "./schema";

type Data = Record<string, unknown>;

/** Addresses of the agency's owner and administrators: they decide on quotes and access. */
export async function managersOf(db: Db, org: string) {
  const rows = await db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(and(eq(members.organizationId, org), inArray(members.role, ["owner", "admin"])));
  return rows.map((row) => row.email);
}

/** A member's address (Reply-To of what they send to a client). */
export async function memberEmail(db: Db, userId: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.email ?? null;
}

/**
 * The agency's page of a version (src/app/(agency)/routes.ts): its deliverable, at that version when
 * it is not the latest, on a request when given (?demande=), or with « Partager la revue » open.
 */
export async function agencyHref(db: Db, org: string, deliverableId: number, target: { commentId?: number; share?: boolean } = {}) {
  const [record] = await db
    .select({ projectId: deliverables.projectId, name: deliverables.name, version: deliverables.version })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  if (!record) return appUrl();
  const versions = await db
    .select({ id: deliverables.id, version: deliverables.version })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.projectId, record.projectId ?? 1), eq(deliverables.name, record.name)))
    .orderBy(asc(deliverables.id));
  const latest = Math.max(...versions.map((entry) => entry.version));
  const page = `${appUrl()}/projets/${record.projectId ?? 1}/livrables/${versions[0]?.id ?? deliverableId}${record.version === latest ? "" : `/versions/${record.version}`}`;
  return target.share ? `${page}?partage=1` : target.commentId ? `${page}?demande=${target.commentId}` : page;
}

/** A client's personal address on a review link (pre-fills their e-mail). */
export const reviewUrl = (link: Data, invitationId?: string) =>
  `${appUrl()}/review/${encodeURIComponent(String(link.token))}${invitationId ? `?invitation=${invitationId}` : ""}`;
