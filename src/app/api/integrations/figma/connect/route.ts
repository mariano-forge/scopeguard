// « Connecter Figma »: a navigation of the owner or an administrator, sent on to Figma's consent page
// with an attempt bound to this member and this browser (src/lib/figmaOAuth.ts).

import { NextResponse } from "next/server";
import { canManageAgency } from "@/db/agencyPermissions";
import { figmaAuthorizeUrl, figmaAvailable } from "@/lib/figma";
import { figmaAttemptCookie, figmaAttemptPath, startFigmaAttempt } from "@/lib/figmaOAuth";
import { figmaReturn } from "@/lib/figmaReturn";
import { requireAgencyUser } from "@/lib/session";

export async function GET() {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  if (!figmaAvailable()) return NextResponse.redirect(figmaReturn("unavailable"));
  if (!canManageAgency(auth.user.role)) return NextResponse.redirect(figmaReturn("forbidden"));
  const attempt = startFigmaAttempt(auth.user.id, auth.user.organizationId);
  const response = NextResponse.redirect(figmaAuthorizeUrl(attempt.state, attempt.codeChallenge));
  response.cookies.set(figmaAttemptCookie, attempt.cookie, {
    httpOnly: true,
    // Lax: Figma sends the member back by a plain link, which carries it; another site's request does not.
    sameSite: "lax",
    secure: (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
    path: figmaAttemptPath,
    maxAge: attempt.maxAge,
  });
  return response;
}
