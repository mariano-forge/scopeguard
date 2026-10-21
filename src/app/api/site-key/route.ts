// Agency: GET /api/site-key -> { key }
// The agency's key for the toolbar's script line (src/lib/siteKey.ts): one line for all its staging
// sites and their versions, which Kora tells apart by the page's address.

import { requireAgencyUser } from "@/lib/session";
import { agencySiteKeyOf } from "@/lib/siteKey";

export async function GET() {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  return Response.json({ key: agencySiteKeyOf(auth.user.organizationId) }, { headers: { "Cache-Control": "private, no-store" } });
}
