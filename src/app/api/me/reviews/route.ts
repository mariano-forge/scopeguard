// Signed in: GET /api/me/reviews -> { reviews } the reviews other agencies invited my own verified address to,
// as a client (src/db/sharedWithMe.ts). Read only: nothing is written, nothing is sent.

import { getDb } from "@/db/client";
import { reviewsSharedWith } from "@/db/sharedWithMe";
import { databaseFailure } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise" }, { status: 401 });
  try {
    const reviews = await reviewsSharedWith(getDb(), user.id, user.organizations.map((organization) => organization.id));
    return Response.json({ reviews }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return databaseFailure("api me/reviews", error);
  }
}
