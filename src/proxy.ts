// Early check that the agency is signed in: only looks for the session cookie (no database access),
// to send visitors to /connexion before loading the app. Routes still verify the session themselves
// (src/lib/session.ts); a forged cookie gets past here but not past them.

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { crossSiteRefusal, crossSiteWrite } from "@/lib/api";

/** Reachable without an agency session: sign-in pages, the client review and what it loads. */
const publicPaths = [/^\/connexion$/, /^\/reinitialiser$/, /^\/review\//, /^\/api\/auth\//, /^\/api\/review\//, /^\/api\/files\//];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Writes from another site's page are refused before anything else (Better Auth checks its own routes).
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && crossSiteWrite(request)) return crossSiteRefusal();
  if (publicPaths.some((path) => path.test(pathname)) || getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return Response.json({ error: "Connexion requise" }, { status: 401 });
  const signIn = new URL("/connexion", request.url);
  if (pathname !== "/") signIn.searchParams.set("suite", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Not on Next's own files nor on static files (icon, logo, PDF worker), nor on /api/files: it checks
  // access itself, and a proxy would hold uploads in memory and cut them at 10 MB.
  matcher: ["/((?!_next/static|_next/image|api/files|.*\\.[a-zA-Z0-9]+$).*)"],
};
