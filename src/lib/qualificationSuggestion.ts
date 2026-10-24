// The AI's suggestion as the agency's qualifying form receives it (src/db/qualificationSuggestion.ts), and
// how the form asks for it: for a stored request (its thread), or for one being typed in « + Demande ».
// Shared by the page and the server.

import type { SuggestedDecision } from "./ai/scopeSuggestion";
import type { CitedLine } from "./scopeCitation";

export type SuggestionView = { decision: SuggestedDecision; reason: string; title?: string; line?: CitedLine };

/** « off »: no AI on this server; « no-scope »: the project has no active scope; « none »: nothing to rely on. */
export type SuggestionAnswer = { status: "off" } | { status: "no-scope" } | { status: "none" } | { status: "ready"; suggestion: SuggestionView };

/** What « + Demande » sends to be read: the words typed so far. */
export type TypedRequest = { title?: string; description?: string; excerpt?: string };

export const typedRequestMaxLength = 6000;

/** Whether this server has an AI to ask (AI_PROVIDER, next.config.ts): otherwise the forms say nothing of it. */
export const suggestionsOffered = () => process.env.NEXT_PUBLIC_AI_SUGGESTIONS === "1";

/** Asks the server; a failure of any kind is « none » (the form works as before), 503 is « off ». */
export async function requestSuggestion(path: string, body: TypedRequest = {}): Promise<SuggestionAnswer> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (response?.status === 503) return { status: "off" };
  const answer = (await response?.json().catch(() => null)) as SuggestionAnswer | null;
  return response?.ok && answer && typeof answer.status === "string" ? answer : { status: "none" };
}
