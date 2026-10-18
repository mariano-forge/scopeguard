// Early check that the agency is signed in: only looks for the session cookie (no database access),
// to send visitors to /connexion before loading the app. Routes still verify the session themselves
// (src/lib/session.ts); a forged cookie gets past here but not past them.

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { crossSiteRefusal, crossSiteWrite } from "@/lib/api";
import { siteFramePath, siteFramePolicy } from "@/lib/securityHeaders";
import { parentOrigin, siteAgencyCookie } from "@/lib/siteReview";

/** Reachable without an agency session: the landing page, sign-in pages, the client review and what they load. */
const publicPaths = [/^\/decouvrir$/, /^\/connexion$/, /^\/reinitialiser$/, /^\/review\//, /^\/api\/auth\//, /^\/api\/review\//, /^\/api\/files\//, /^\/api\/demo$/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Writes from another site's page are refused before anything else (Better Auth checks its own routes).
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && crossSiteWrite(request)) return crossSiteRefusal();
  // Kora's panel on a staging site: framed only by the page its address names. The page checks that
  // this is the site of the shared deliverable, and shows nothing otherwise (src/lib/siteReview.ts).
  if (siteFramePath.test(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", siteFramePolicy(parentOrigin(request.nextUrl.searchParams.get("parent"))));
    return response;
  }
  const signedIn = Boolean(getSessionCookie(request));
  // One front door: at "/", a visitor sees the landing page and a member their home, the address unchanged.
  if (pathname === "/" && !signedIn) return NextResponse.rewrite(new URL("/decouvrir", request.url));
  if (publicPaths.some((path) => path.test(pathname)) || signedIn) return NextResponse.next();
  // An agency member in the panel on the staging site writes through the agency's routes, which only
  // open some actions to that session (src/lib/agencyActionRoute.ts).
  if (pathname.startsWith("/api/") && request.cookies.has(siteAgencyCookie)) return NextResponse.next();

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
