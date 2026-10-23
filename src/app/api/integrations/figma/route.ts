// The agency's Figma connection (US-054): what the settings show, and disconnecting it (owner and
// administrators). Never a token: they stay sealed on the server (src/db/figmaConnection.ts).

import { getDb } from "@/db/client";
import { canManageAgency } from "@/db/agencyPermissions";
import { deleteFigmaConnection, figmaConnectionStatus } from "@/db/figmaConnection";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { figmaAvailable } from "@/lib/figma";
import { requireAgencyUser } from "@/lib/session";

export async function GET() {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  try {
    const connection = await figmaConnectionStatus(getDb(), auth.user.organizationId);
    return Response.json({ available: figmaAvailable(), canManage: canManageAgency(auth.user.role), connection });
  } catch (error) {
    return databaseFailure("api figma status", error);
  }
}

export async function DELETE() {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  if (!canManageAgency(auth.user.role))
    return Response.json({ error: "Seuls le propriétaire et les administrateurs de l’agence gèrent la connexion à Figma." }, { status: 403 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    await deleteFigmaConnection(db, auth.user.organizationId);
    return Response.json({ connection: null });
  } catch (error) {
    return databaseFailure("api figma disconnect", error);
  }
}
