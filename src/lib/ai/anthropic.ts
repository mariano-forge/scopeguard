// Claude, through Anthropic's Messages API (a plain HTTP call: no SDK to add). The model must answer by
// calling the suggestion tool (`tool_choice`), so its answer is data in a known shape. The instructions
// and the scope are cached by Anthropic (`cache_control`): the next requests of the project pay less.

import { requestBlock, scopeBlock, suggestionInstructions, suggestionTool, type SuggestionModel } from "./scopeSuggestion";

export type AnthropicOptions = {
  apiKey: string;
  /** Claude Haiku: quick and cheap, enough to compare a request with a few lines. */
  model?: string;
  /** Anthropic's API; another address only for the tests (a local stand-in). */
  baseUrl?: string;
  /** Past this, no suggestion rather than a waiting agency. */
  timeoutMs?: number;
};

export const defaultAnthropicModel = "claude-haiku-5-5";

export function anthropicModel({ apiKey, model = defaultAnthropicModel, baseUrl = "https://api.anthropic.com", timeoutMs = 10_000 }: AnthropicOptions): SuggestionModel {
  return {
    async suggest({ scope, exclusions, request }) {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system: [
            { type: "text", text: suggestionInstructions },
            { type: "text", text: scopeBlock(scope, exclusions), cache_control: { type: "ephemeral" } },
          ],
          tools: [suggestionTool],
          tool_choice: { type: "tool", name: suggestionTool.name },
          messages: [{ role: "user", content: requestBlock(request) }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Anthropic answered ${response.status}`);
      const body = (await response.json()) as { content?: { type?: string; name?: string; input?: unknown }[] };
      return body.content?.find((block) => block.type === "tool_use" && block.name === suggestionTool.name)?.input ?? null;
    },
  };
}
