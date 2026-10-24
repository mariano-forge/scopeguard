// GPT on Azure (Microsoft Foundry), through the OpenAI v1 API of an Azure resource: a plain HTTP call, no
// SDK to add. Chosen for Kora because it can run in the EU data zone, a « Data Zone Standard » deployment,
// where Claude is not offered (decided with the product owner on 24 October 2026; trials run on « Global »).
// The model must answer by calling the one tool it is given (`tool_choice`, `strict`), so its answer is data in a known shape, checked afterwards like any other.
// Azure caches a long identical start of the request by itself: the instructions and the scope come first.

import { requestBlock, scopeBlock, suggestionInstructions, suggestionTool, type SuggestionModel } from "./scopeSuggestion";
import { documentBlock, readingInstructions, readingTool } from "./scopeReading";

export type AzureOpenAIOptions = {
  /** The resource's address, as Foundry shows it (https://<name>.openai.azure.com or …services.ai.azure.com). */
  endpoint: string;
  apiKey: string;
  /** The deployment's name, chosen in Foundry (not the model's). */
  deployment: string;
  /** Past this, no answer rather than a waiting agency. */
  timeoutMs?: number;
};

/** The settings of this server (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AI_MODEL), or null when one is missing. */
export function azureOptionsFromEnv(): AzureOpenAIOptions | null {
  const { AZURE_OPENAI_ENDPOINT: endpoint, AZURE_OPENAI_API_KEY: apiKey, AI_MODEL: deployment } = process.env;
  return endpoint && apiKey && deployment ? { endpoint, apiKey, deployment } : null;
}

/** The chat completions address of the resource, whatever form of its address was pasted. */
export const completionsUrl = (endpoint: string) => `${endpoint.replace(/\/+$/, "").replace(/\/openai(\/.*)?$/, "")}/openai/v1/chat/completions`;

type Tool = { name: string; description: string; input_schema: object };

/** One call where the model must answer with `tool`: its arguments, parsed, or null. */
async function callTool(
  options: AzureOpenAIOptions,
  { system, user, tool, effort, maxTokens, timeoutMs }: { system: string[]; user: string; tool: Tool; effort: "low" | "medium"; maxTokens: number; timeoutMs: number },
) {
  const response = await fetch(completionsUrl(options.endpoint), {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": options.apiKey },
    body: JSON.stringify({
      model: options.deployment,
      // Reasoning tokens count here too: room enough for a little thinking and the answer.
      max_completion_tokens: maxTokens,
      reasoning_effort: effort,
      messages: [...system.map((content) => ({ role: "system", content })), { role: "user", content: user }],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true } }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? timeoutMs),
  });
  if (!response.ok) throw new Error(`Azure OpenAI answered ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
  const call = body.choices?.[0]?.message?.tool_calls?.find((candidate) => candidate.function?.name === tool.name);
  if (typeof call?.function?.arguments !== "string") return null;
  try {
    return JSON.parse(call.function.arguments) as unknown;
  } catch {
    return null;
  }
}

/** Strict tools need every object closed: the suggestion's schema, shared with Claude, gets it here. */
const suggestionSchema = { ...suggestionTool, input_schema: { ...suggestionTool.input_schema, additionalProperties: false } };

/** Comparing a request with a few lines needs little reasoning: quick, as the agency waits for it. */
export function azureSuggestionModel(options: AzureOpenAIOptions): SuggestionModel {
  return {
    suggest: ({ scope, request }) =>
      callTool(options, { system: [suggestionInstructions, scopeBlock(scope)], user: requestBlock(request), tool: suggestionSchema, effort: "low", maxTokens: 2_000, timeoutMs: 15_000 }),
  };
}

/**
 * Reads a document's text into scope items: what the model proposes, unchecked (readExtracted bounds it).
 * More reasoning than a suggestion: rare, and with little of it the mini model dropped quantities (trial of
 * 24 October 2026).
 */
export function azureScopeReader(options: AzureOpenAIOptions) {
  return async (text: string) => {
    const answer = await callTool(options, { system: [readingInstructions], user: documentBlock(text), tool: readingTool, effort: "medium", maxTokens: 16_000, timeoutMs: 120_000 });
    return answer && typeof answer === "object" && "items" in answer ? answer.items : null;
  };
}
