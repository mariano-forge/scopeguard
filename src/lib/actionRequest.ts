// Browser side of the action routes (client review: src/lib/reviewActions.ts; agency:
// src/lib/agencyActions.ts). One request per action; the state is then fetched back from the server
// (src/lib/stateSync.ts sendAction), so a refused action disappears from the page.

import { toast } from "sonner";
import type { SharedState } from "./sharedState";
import { acceptState, sendAction } from "./stateSync";

export type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Refusal = { status: number; error?: string; code?: string };

/**
 * Sends the action; returns its answer (the id it created or touched…), or null once the refusal is handled.
 * `refused` handles the answers proper to the page (session ended, read-only…); return true when done.
 */
export type ActionAnswer = { id?: number } & Record<string, unknown>;

export function actionRequest(url: string, method: Method, body: Record<string, unknown> | undefined, refused: (refusal: Refusal) => boolean): Promise<ActionAnswer | null> {
  return sendAction(async () => {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const answer = (await response?.json().catch(() => null)) as (ActionAnswer & { error?: string; code?: string }) | null;
    if (response?.ok) {
      if (answer && typeof answer.revision === "number" && answer.state) acceptState({ revision: answer.revision, state: answer.state as SharedState });
      return answer ?? {};
    }
    if (!response || !refused({ status: response.status, error: answer?.error, code: answer?.code }))
      toast.error(answer?.error ?? "Enregistrement impossible pour l’instant. Réessayez.");
    return null;
  });
}
