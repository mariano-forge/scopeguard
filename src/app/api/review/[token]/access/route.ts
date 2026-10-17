// Where a visitor of a review link stands, before loading the review:
//   GET /api/review/:token/access?invitation=<id>
//   -> { mode: "client" | "preview" | "agency" | "none", verifiedEmail, invitation, name, deliverable, role, agency }
// verifiedEmail: proven on this device (for "none": proven but not invited to this link).
// invitation: { id, masked } of a personal link: its address masked ("c•••••@client.test"), never whole,
// since whoever holds the link would learn it; the code is asked by the invitation's id.
// name: the verified client's full name; null at their first verification (the page asks for it).
// role: the client's role on this link ("decider" | "contributor", src/lib/clientRoles.ts); null otherwise.
// newerVersion: { version, href } of a later version shared with this client, if any; null otherwise.
// agency: { name, href } of the member in the panel on the staging site ("agency"), href opening the
// version in Kora (quotes and sharing are done there); null otherwise.

import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { invitationEmail, maskEmail, newerSharedVersion, reviewedDeliverableName, reviewProfileName } from "@/db/reviewAuth";
import { agencyHref } from "@/db/mailTargets";
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
      invitation: invited ? { id: request.nextUrl.searchParams.get("invitation"), masked: maskEmail(invited) } : null,
      name: viewer.email ? await reviewProfileName(db, viewer.email) : null,
      deliverable: await reviewedDeliverableName(db, viewer.access),
      role: viewer.mode === "client" ? viewer.role : null,
      newerVersion: viewer.mode === "client" ? await newerSharedVersion(db, viewer.access, viewer.email) : null,
      agency: viewer.mode === "agency" ? { name: viewer.member.name, href: await agencyHref(db, viewer.access.organizationId, viewer.access.deliverableId) } : null,
    });
  } catch (error) {
    return databaseFailure("api/review/access", error);
  }
}
