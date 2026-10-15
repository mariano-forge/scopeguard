// Early check that the agency is signed in: only looks for the session cookie (no database access),
// to send visitors to /connexion before loading the app. Routes still verify the session themselves
// (src/lib/session.ts); a forged cookie gets past here but not past them.

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Reachable without an agency session: sign-in pages, the client review and what it loads. */
const publicPaths = [/^\/connexion$/, /^\/reinitialiser$/, /^\/review\//, /^\/api\/auth\//, /^\/api\/review\//, /^\/api\/files\//];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (publicPaths.some((path) => path.test(pathname)) || getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return Response.json({ error: "Connexion requise" }, { status: 401 });
  const signIn = new URL("/connexion", request.url);
  if (pathname !== "/") signIn.searchParams.set("suite", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Not on Next's own files nor on static files (icon, logo, PDF worker).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
