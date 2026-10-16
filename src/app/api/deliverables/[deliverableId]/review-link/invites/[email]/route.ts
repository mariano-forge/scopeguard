// Agency: DELETE /api/deliverables/:deliverableId/review-link/invites/:email -> the invitation is
// removed, which cuts that client's access at once (src/db/agencyActions.ts).

import { agencyActionResponse } from "@/lib/agencyActionRoute";

/** The address as typed, whether or not the segment is still percent-encoded. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export async function DELETE(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/review-link/invites/[email]">) {
  const { deliverableId, email } = await context.params;
  return agencyActionResponse(request, "invite.remove", { deliverableId, email: decoded(email) });
}
