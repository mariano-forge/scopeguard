"use client";

// What helps the agency qualify a request against the project's active scope (US-045): the line of the
// scope an « Inclus » cites, and the AI's suggestion (src/lib/qualificationSuggestion.ts), which only
// pre-fills the form: the agency decides, nothing of the suggestion is stored, the client never sees it.
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

/** What the AI said, or that it is reading; nothing when it has nothing to say. */
export function SuggestionNote({ state }: { state: SuggestionState }) {
  if (state.status === "idle" || state.status === "off") return null;
  return (
    <section className="qualify-suggestion" aria-label="Suggestion de l’IA" aria-live="polite">
      {state.status === "asking" ? (
        <p>
          <Loader2 className="animate-spin" aria-hidden="true" /> L’IA compare la demande au périmètre…
        </p>
      ) : state.status === "no-scope" ? (
        <p>
          <Sparkles aria-hidden="true" /> Activez le périmètre du projet pour que l’IA suggère une qualification.
        </p>
      ) : state.status === "none" ? (
        <p>
          <Sparkles aria-hidden="true" /> L’IA n’a pas de suggestion pour cette demande.
        </p>
      ) : (
        <>
          <p>
            <Sparkles aria-hidden="true" /> <b>Suggestion : {decisionLabels[state.suggestion.decision]}</b>
            {state.suggestion.line && <> · ligne « {state.suggestion.line.title} »</>}
          </p>
          <p className="qualify-suggestion-reason">{state.suggestion.reason}</p>
          <small>Le formulaire est pré-rempli : vérifiez avant d’enregistrer, la décision reste la vôtre.</small>
        </>
      )}
    </section>
  );
}

/** The line of the active scope an « Inclus » cites; « Aucune » is always possible. */
export function CitedLineField({ id, lines, value, onChange }: { id: string; lines: CitedLine[]; value: number | undefined; onChange: (value: number | undefined) => void }) {
  if (!lines.length) return null;
  return (
    <label htmlFor={id}>
      Ligne du périmètre
      <select id={id} className="qualify-line" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : undefined)}>
        <option value="">Aucune</option>
        {lines.map((line) => (
          <option key={line.id} value={line.id}>
            {line.title}
          </option>
        ))}
      </select>
    </label>
  );
}
