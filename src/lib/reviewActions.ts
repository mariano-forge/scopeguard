// Browser side of the client's actions on a review: one request per action, to the routes under
// /api/review/:token/ (src/db/reviewActions.ts). The page shows the action at once; the state is then
// fetched back from the server (src/lib/stateSync.ts sendAction), so a refused action disappears.

import { toast } from "sonner";
import { sendAction } from "./stateSync";

type Method = "POST" | "PATCH" | "DELETE";

/** Sends the action; returns the id it created or touched, or null once the refusal is shown. */
export function reviewAction(token: string, path: string, method: Method, body?: Record<string, unknown>): Promise<{ id?: number } | null> {
  return sendAction(async () => {
    const response = await fetch(`/api/review/${encodeURIComponent(token)}/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const answer = (await response?.json().catch(() => null)) as { id?: number; error?: string } | null;
    if (response?.ok) return answer ?? {};
    // Session ended on this device: the page asks for a new code.
    if (response?.status === 401) window.location.reload();
    else if (response?.status === 403) toast("Aperçu agence : les actions ne sont pas enregistrées.");
    else toast.error(answer?.error ?? "Enregistrement impossible pour l’instant. Réessayez.");
    return null;
  });
}
