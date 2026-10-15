// Who is signed in, checked against the database. This is the real check: src/proxy.ts only looks
// for the cookie to redirect early.

import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth";

export type CurrentUser = { id: string; name: string; email: string; image: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}
