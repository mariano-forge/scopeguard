// Where a visitor of a review link stands, before loading the review:
//   GET /api/review/:token/access?invitation=<id>
//   -> { mode: "client" | "preview" | "none", verifiedEmail, invitedEmail, deliverable }
// verifiedEmail: proven on this device (for "none": proven but not invited to this link).
// invitedEmail: the address of the personal invitation, to pre-fill the form.

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { invitationEmail, reviewedDeliverableName } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";

export async function GET(request: NextRequest, context: RouteContext<"/api/review/[token]/access">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    const invited = invitationEmail(viewer.access.link, request.nextUrl.searchParams.get("invitation"));
    return Response.json({ mode: viewer.mode, verifiedEmail: viewer.email, invitedEmail: invited, deliverable: await reviewedDeliverableName(getDb(), viewer.access) });
  } catch (error) {
    return databaseFailure("api/review/access", error);
  }
}
