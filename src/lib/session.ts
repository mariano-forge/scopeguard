// Who is signed in and in which agency, checked against the database. This is the real check:
// src/proxy.ts only looks for the cookie to redirect early.

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { members, organizations } from "@/db/auth-schema";
import { getAuth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** The agency this member works in; null until they create or join one. */
  organizationId: string | null;
  organizationName: string | null;
  role: string | null;
  /** Every agency they belong to, to switch between them. */
  organizations: { id: string; name: string }[];
};

export type AgencyUser = CurrentUser & { organizationId: string; role: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;

  // Membership is read on every request: someone removed from an agency loses access at once,
  // even with a session that still points to it.
  const memberships = await getDb()
    .select({ id: organizations.id, name: organizations.name, role: members.role })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, id))
    .orderBy(asc(members.createdAt));
  const active = memberships.find((membership) => membership.id === session.session.activeOrganizationId) ?? memberships[0] ?? null;

  return {
    id,
    name,
    email,
    image: image ?? null,
    organizationId: active?.id ?? null,
    organizationName: active?.name ?? null,
    role: active?.role ?? null,
    organizations: memberships.map(({ id: orgId, name: orgName }) => ({ id: orgId, name: orgName })),
  };
}

/** The signed-in member with their agency, or the response to send back. */
export async function requireAgencyUser(): Promise<{ user: AgencyUser } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "Connexion requise" }, { status: 401 }) };
  if (!user.organizationId || !user.role) return { response: Response.json({ error: "Aucune agence" }, { status: 403 }) };
  return { user: user as AgencyUser };
}

/** Whether a user belongs to an agency (an agency member previewing one of its client links). */
export async function isMemberOf(userId: string, organizationId: string) {
  const [row] = await getDb()
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}
