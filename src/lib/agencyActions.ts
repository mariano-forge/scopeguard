// Browser side of the agency's actions: one request per action, to the routes under /api/comments
// (src/db/agencyActions.ts), through src/lib/actionRequest.ts.

import { toast } from "sonner";
import { actionRequest, type Method } from "./actionRequest";

/** Sends the action; returns the id it created or touched, or null once the refusal is shown. */
export function agencyAction(path: string, method: Method, body?: Record<string, unknown>) {
  return actionRequest(`/api/${path}`, method, body, ({ status, code, error }) => {
    if (status === 401) window.location.assign("/connexion");
    else if (status === 403 && code === "ADMIN_ONLY") toast.error(error ?? "Action réservée aux administrateurs de l’agence.");
    // Removed from the agency: the home page sends them to /bienvenue.
    else if (status === 403) window.location.assign("/");
    else return false;
    return true;
  });
}
