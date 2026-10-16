// Agency, one invitation on a version's client link (src/db/agencyActions.ts):
//   PATCH  /api/deliverables/:deliverableId/review-link/invites/:email { role } -> "decider" or "contributor"
//   DELETE /api/deliverables/:deliverableId/review-link/invites/:email          -> removed: that client's access stops at once

import { agencyActionResponse } from "@/lib/agencyActionRoute";

/** The address as typed, whether or not the segment is still percent-encoded. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

type Context = RouteContext<"/api/deliverables/[deliverableId]/review-link/invites/[email]">;

export async function PATCH(request: Request, context: Context) {
  const { deliverableId, email } = await context.params;
  return agencyActionResponse(request, "invite.role", { deliverableId, email: decoded(email) });
}

export async function DELETE(request: Request, context: Context) {
  const { deliverableId, email } = await context.params;
  return agencyActionResponse(request, "invite.remove", { deliverableId, email: decoded(email) });
}
