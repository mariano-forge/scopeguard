// The line of the project's active scope a qualification « Inclus » cites (US-045): « prévu par la ligne
// Intégration WordPress · 6 pages ». Chosen by the agency (pre-filled by the AI's suggestion, never set by
// it), checked by the server against the active scope, and kept with the request as it read then: a later
// change of the scope does not rewrite what was agreed. The client and the proof read it.
// Shared by the page and the server.

import { quantityLabel, type ProjectScope, type ScopeLine } from "./projectScope";

export type CitedLine = { id: number; title: string };

/** « Intégration WordPress · 6 pages » */
export const lineLabel = (line: Pick<ScopeLine, "title" | "quantity" | "unit">) => [line.title, quantityLabel(line)].filter(Boolean).join(" · ");

/** The scope when it is the project's reference, or null: a draft is cited by nobody. */
export const activeScope = (scope: ProjectScope | null | undefined) => (scope?.activatedAt ? scope : null);

/** The lines a qualification may cite, as they read. */
export const citableLines = (scope: ProjectScope | null | undefined): CitedLine[] => (activeScope(scope)?.lines ?? []).map((line) => ({ id: line.id, title: lineLabel(line) }));

/** The line `id` of the active scope, as it reads now; undefined when it is not one of them. */
export const citedLine = (scope: ProjectScope | null | undefined, id: number | undefined) => (id === undefined ? undefined : citableLines(scope).find((line) => line.id === id));

/** A cited line as stored with a request, or undefined. */
export function readCitedLine(value: unknown): CitedLine | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, title } = value as Record<string, unknown>;
  return typeof id === "number" && typeof title === "string" && title ? { id, title } : undefined;
}
