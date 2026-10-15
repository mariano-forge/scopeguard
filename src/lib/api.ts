// Helpers shared by the API routes.

import type { StateChanges } from "./sharedState";

export function databaseFailure(scope: string, error: unknown) {
  console.error(`[${scope}]`, error);
  return Response.json({ error: "Base de données indisponible" }, { status: 503 });
}

/** Body of a PATCH: { changes }, or null when malformed. */
export async function readChanges(request: Request): Promise<StateChanges | null> {
  try {
    const body = (await request.json()) as { changes?: StateChanges };
    return body?.changes && typeof body.changes === "object" ? body.changes : null;
  } catch {
    return null;
  }
}
