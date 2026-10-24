// Which model suggests qualifications, chosen by AI_PROVIDER: "azure" (GPT on Azure, EU data zone online:
// src/lib/ai/azureOpenAI.ts), "anthropic" (Claude, with ANTHROPIC_API_KEY), "fake" (the tests' stand-in,
// never online), or nothing: then Kora suggests nothing and works as before. Another provider is one more
// case here, nothing else changes.

import { anthropicModel } from "./anthropic";
import { azureOptionsFromEnv, azureSuggestionModel } from "./azureOpenAI";
import type { ScopeLine, SuggestionModel } from "./scopeSuggestion";

/** The tests' model: « inclus » when a word of a line's title is in the request, citing that line; otherwise « hors scope ». Its title: the request's first sentence. */
export const fakeModel: SuggestionModel = {
  async suggest({ scope, request }) {
    const text = `${request.title ?? ""} ${request.text}`.toLowerCase();
    const words = (line: ScopeLine) => line.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3);
    const line = scope.find((candidate) => words(candidate).some((word) => text.includes(word)));
    const titre = (request.title ?? request.text.replace(/^(Client|Agence) : /, "")).split(/[.!?\n]/)[0]!.trim().slice(0, 80);
    return line
      ? { decision: "inclus", ligne: line.id, raison: `Prévu par la ligne « ${line.title} ».`, titre }
      : { decision: "hors_scope", ligne: null, raison: "Aucune ligne du périmètre ne couvre cette demande.", titre };
  },
};

/** The model set up for this server, or null: no suggestion at all. */
export function suggestionModel(): SuggestionModel | null {
  switch (process.env.AI_PROVIDER) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ? anthropicModel({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || undefined }) : null;
    case "azure": {
      const options = azureOptionsFromEnv();
      return options ? azureSuggestionModel(options) : null;
    }
    case "fake":
      return fakeModel;
    default:
      return null;
  }
}
