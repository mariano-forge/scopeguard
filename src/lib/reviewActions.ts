// Browser side of the client's actions on a review: one request per action, to the routes under
// /api/review/:token/ (src/db/reviewActions.ts), through src/lib/actionRequest.ts.

import { toast } from "sonner";
import { actionRequest, type Method } from "./actionRequest";

/** Sends the action; returns the id it created or touched, or null once the refusal is shown. */
export function reviewAction(token: string, path: string, method: Method, body?: Record<string, unknown>) {
  return actionRequest(`/api/review/${encodeURIComponent(token)}/${path}`, method, body, ({ status, code, error }) => {
    // Session ended on this device: the page asks for a new code.
    if (status === 401) window.location.reload();
    else if (status === 403 && code === "DECIDER_ONLY") toast.error(error ?? "Seul un décideur peut prendre cette décision.");
    else if (status === 403) toast("Aperçu agence : les actions ne sont pas enregistrées.");
    else return false;
    return true;
  });
}
