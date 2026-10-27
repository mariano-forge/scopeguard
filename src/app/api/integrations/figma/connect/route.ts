// « Connecter mon compte Figma »: a navigation of a member, sent on to Figma's consent page with an attempt
// bound to this member and this browser (src/lib/figmaOAuth.ts), and the page of Kora to come back to.

import { NextResponse, type NextRequest } from "next/server";
import { figmaAuthorizeUrl, figmaAvailable } from "@/lib/figma";
import { figmaAttemptCookie, figmaAttemptPath, startFigmaAttempt } from "@/lib/figmaOAuth";
import { figmaBackParam, figmaReturn, readFigmaBack } from "@/lib/figmaReturn";
import { requireAgencyUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const back = readFigmaBack(request.nextUrl.searchParams.get(figmaBackParam));
  if (!figmaAvailable()) return NextResponse.redirect(figmaReturn("unavailable", back));
  const attempt = startFigmaAttempt(auth.user.id, auth.user.organizationId, back);
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
