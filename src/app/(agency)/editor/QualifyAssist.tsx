"use client";

// What helps the agency qualify a request against the project's active scope (US-045): the AI's suggestion
// (src/lib/qualificationSuggestion.ts), which only pre-fills the form: the agency decides, nothing of the
// suggestion is stored, the client never sees it. No line of the scope is cited from the form any more
// (decided 25 October 2026).
// Used by the bubble's qualifying form and by « + Demande ».

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { requestSuggestion, suggestionsOffered, type SuggestionAnswer, type SuggestionView, type TypedRequest } from "@/lib/qualificationSuggestion";
import type { CitedLine } from "@/lib/scopeCitation";
import type { Qualification } from "./CanvasComments";

/** The project's active scope as a qualifying form uses it: the lines to cite (none: no active scope), and where to ask the AI. */
export type ScopeAssist = { lines: CitedLine[]; suggestionPath: string };

export type SuggestionState = { status: "idle" } | { status: "asking" } | SuggestionAnswer;

const decisionLabels: Record<Qualification, string> = { Inclus: "Inclus", "Hors périmètre": "Hors scope", "À qualifier": "À clarifier" };

/**
 * Asks the AI, from the gesture that wants it (opening the qualifying form, or « Suggérer » in « + Demande »):
 * `onReady` pre-fills the form. Not offered when this server has no AI.
 */
export function useSuggestion(path: string | undefined, onReady: (suggestion: SuggestionView) => void) {
  const [state, setState] = useState<SuggestionState>({ status: "idle" });
  const offered = Boolean(path) && suggestionsOffered();
  const ask = (request?: TypedRequest) => {
    if (!offered || !path) return;
    setState({ status: "asking" });
    void requestSuggestion(path, request).then((result) => {
      setState(result);
      if (result.status === "ready") onReady(result.suggestion);
    });
  };
  return { state, ask, offered };
}

/** The tone of a qualification, as on the requests' badges (globals.css .decision-*). */
const decisionTones: Record<Qualification, string> = { Inclus: "is-included", "Hors périmètre": "is-outside", "À qualifier": "is-clarify" };

/**
 * What the AI said, or that it is reading; nothing when it has nothing to say. Neutral, as a note (feedback of
 * 25 October 2026: « trop de bleu »): the suggestion in a line, its reason under it, folded on demand; the
 * agency's part said once, in a line.
 */
export function SuggestionNote({ state }: { state: SuggestionState }) {
  if (state.status === "idle" || state.status === "off") return null;
  const status = (text: string) => (
    <p className="qualify-suggestion-status">
      <Sparkles aria-hidden="true" /> {text}
    </p>
  );
  return (
    <section className="qualify-suggestion" aria-label="Suggestion de l’IA" aria-live="polite">
      {state.status === "asking" ? (
        <p className="qualify-suggestion-status">
          <Loader2 className="animate-spin" aria-hidden="true" /> L’IA compare la demande au périmètre…
        </p>
      ) : state.status === "no-scope" ? (
        status("Activez le périmètre du projet pour recevoir une suggestion de l’IA.")
      ) : state.status === "none" ? (
        status("L’IA n’a pas de suggestion pour cette demande.")
      ) : (
        <>
          <details open>
            <summary>
              <Sparkles aria-hidden="true" /> Suggestion de l’IA :{" "}
              <b className={decisionTones[state.suggestion.decision]}>{decisionLabels[state.suggestion.decision]}</b>
            </summary>
            <p className="qualify-suggestion-reason">{state.suggestion.reason}</p>
          </details>
          <small>Vérifiez chaque ligne du formulaire pré-rempli avant d’enregistrer.</small>
        </>
      )}
    </section>
  );
}
