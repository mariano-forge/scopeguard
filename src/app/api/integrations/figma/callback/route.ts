// Figma sends the member back here with a code. It is stored only for the attempt this browser started
// (src/lib/figmaOAuth.ts), by that member, still in that agency; anything else changes nothing.

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { saveFigmaConnection } from "@/db/figmaConnection";
import { databaseFailure } from "@/lib/api";
import { exchangeFigmaCode, figmaAvailable, figmaMe } from "@/lib/figma";
import { figmaAttemptCookie, figmaAttemptPath, finishFigmaAttempt } from "@/lib/figmaOAuth";
import { figmaReturn, type FigmaOutcome } from "@/lib/figmaReturn";
import { requireAgencyUser } from "@/lib/session";

function back(outcome: FigmaOutcome) {
  const response = NextResponse.redirect(figmaReturn(outcome));
  // One attempt, one use.
  response.cookies.set(figmaAttemptCookie, "", { path: figmaAttemptPath, maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  if (!figmaAvailable()) return back("unavailable");
  const params = request.nextUrl.searchParams;
  const attempt = finishFigmaAttempt(params.get("state"), request.cookies.get(figmaAttemptCookie)?.value);
  if (!attempt || attempt.userId !== auth.user.id || attempt.organizationId !== auth.user.organizationId) return back("invalid");
  const code = params.get("code");
  if (!code || code.length > 500) return back("refused");

  const tokens = await exchangeFigmaCode(code, attempt.verifier);
  const user = tokens && (await figmaMe(tokens.accessToken));
  if (!tokens || !user) return back("refused");
  try {
    await saveFigmaConnection(getDb(), auth.user.organizationId, auth.user.id, tokens, user);
  } catch (error) {
    return databaseFailure("api figma callback", error);
  }
  return back("connected");
}
