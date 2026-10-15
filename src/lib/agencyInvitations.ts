// Invitations to join an agency, read on the server for the welcome and invitation pages.
// Accepting goes through Better Auth (it checks that the signed-in address is the invited one).

import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { invitations, organizations, users } from "@/db/auth-schema";

export type AgencyInvitation = { id: string; email: string; status: string; expired: boolean; organizationName: string; inviterName: string };

const inviters = alias(users, "inviters");

function query() {
  return getDb()
    .select({
      id: invitations.id,
      email: invitations.email,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      organizationName: organizations.name,
      inviterName: inviters.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .innerJoin(inviters, eq(invitations.inviterId, inviters.id));
}

const shape = (row: Awaited<ReturnType<typeof query>>[number]): AgencyInvitation => ({
  id: row.id,
  email: row.email,
  status: row.status,
  expired: row.expiresAt.getTime() < Date.now(),
  organizationName: row.organizationName,
  inviterName: row.inviterName,
});

export async function agencyInvitation(id: string) {
  if (!id || id.length > 100) return null;
  const [row] = await query().where(eq(invitations.id, id)).limit(1);
  return row ? shape(row) : null;
}

/** Pending, unexpired invitations addressed to an e-mail. */
export async function pendingAgencyInvitations(email: string) {
  const rows = await query().where(
    and(eq(invitations.email, email.toLowerCase()), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())),
  );
  return rows.map(shape);
}
