// Where a visitor of a review link stands, before loading the review:
//   GET /api/review/:token/access?invitation=<id>
//   -> { mode: "client" | "preview" | "none", verifiedEmail, invitedEmail, name, deliverable, role }
// verifiedEmail: proven on this device (for "none": proven but not invited to this link).
// invitedEmail: the address of the personal invitation, to pre-fill the form.
// name: the verified client's full name; null at their first verification (the page asks for it).
// role: the client's role on this link ("decider" | "contributor", src/lib/clientRoles.ts); null otherwise.
// newerVersion: { version, href } of a later version shared with this client, if any; null otherwise.

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { invitationEmail, newerSharedVersion, reviewedDeliverableName, reviewProfileName } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";

export async function GET(request: NextRequest, context: RouteContext<"/api/review/[token]/access">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    const invited = invitationEmail(viewer.access.link, request.nextUrl.searchParams.get("invitation"));
    const db = getDb();
    return Response.json({
      mode: viewer.mode,
      verifiedEmail: viewer.email,
      invitedEmail: invited,
      name: viewer.email ? await reviewProfileName(db, viewer.email) : null,
      deliverable: await reviewedDeliverableName(db, viewer.access),
      role: viewer.mode === "client" ? viewer.role : null,
      newerVersion: viewer.mode === "client" ? await newerSharedVersion(db, viewer.access, viewer.email) : null,
    });
  } catch (error) {
    return databaseFailure("api/review/access", error);
  }
}
