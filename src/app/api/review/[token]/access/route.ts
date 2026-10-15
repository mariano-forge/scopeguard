// Where a visitor of a review link stands, before loading the review:
//   GET /api/review/:token/access?invitation=<id>
//   -> { mode: "client" | "preview" | "none", verifiedEmail, invitedEmail, deliverable }
// verifiedEmail: proven on this device (for "none": proven but not invited to this link).
// invitedEmail: the address of the personal invitation, to pre-fill the form.

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invitationEmail } from "@/db/reviewAuth";
import { deliverables } from "@/db/schema";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";

export async function GET(request: NextRequest, context: RouteContext<"/api/review/[token]/access">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    const [record] = await getDb()
      .select({ name: deliverables.name })
      .from(deliverables)
      .where(eq(deliverables.id, viewer.access.deliverableId))
      .limit(1);
    const invited = invitationEmail(viewer.access.link, request.nextUrl.searchParams.get("invitation"));
    return Response.json({ mode: viewer.mode, verifiedEmail: viewer.email, invitedEmail: invited, deliverable: record?.name ?? "" });
  } catch (error) {
    return databaseFailure("api/review/access", error);
  }
}
