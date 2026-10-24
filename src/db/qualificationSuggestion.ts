// The AI's suggestion of how to qualify a request (US-045), for the agency's qualifying form: built by the
// server from what the database holds (the request, the project's active scope), never from the page.
// Only a suggestion: the page pre-fills its form with it, the agency decides, nothing of it is stored,
// and the client never sees it (src/lib/ai/scopeSuggestion.ts).

import { and, eq } from "drizzle-orm";
import { sideOf } from "@/lib/authors";
import { maskContacts, suggestQualification, type ScopeRequest, type SuggestionModel } from "@/lib/ai/scopeSuggestion";
import { readScope, type ProjectScope } from "@/lib/projectScope";
import type { SuggestionAnswer } from "@/lib/qualificationSuggestion";
import { lineLabel } from "@/lib/scopeCitation";
import type { Db } from "./client";
import { deliverables, projects } from "./schema";

type Data = Record<string, unknown>;

/** The scope of the project a deliverable belongs to, when it is active (the reference); null otherwise. */
export async function activeScopeOf(db: Db, org: string, deliverableId: number): Promise<ProjectScope | null> {
  const [row] = await db
    .select({ data: projects.data })
    .from(deliverables)
    .innerJoin(projects, and(eq(projects.organizationId, deliverables.organizationId), eq(projects.id, deliverables.projectId)))
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  const stored = (row?.data as Data | undefined)?.scope as Data | undefined;
  const scope = readScope(stored);
  // readScope keeps what a page may send; the activation is the server's own, read here.
  return scope && typeof stored?.activatedAt === "number" ? { ...scope, activatedAt: stored.activatedAt } : null;
}

/** A stored request as the model reads it: its words and its thread, who said what, contact details masked. */
export function requestOfComment(comment: Data): ScopeRequest {
  const replies = Array.isArray(comment.replies) ? (comment.replies as Data[]) : [];
  const said = (message: Data) => `${sideOf(message) === "agency" ? "Agence" : "Client"} : ${typeof message.message === "string" ? message.message : ""}`;
  const text = [said(comment), ...replies.map(said)].join("\n");
  return {
    text: maskContacts(text),
    ...(typeof comment.title === "string" && comment.title ? { title: maskContacts(comment.title) } : {}),
    ...(typeof comment.location === "string" && comment.location ? { location: comment.location } : {}),
  };
}

/** What the model answers about `request`, against the deliverable's active scope; « no-scope » without one. */
export async function suggestionFor(db: Db, org: string, deliverableId: number, model: SuggestionModel, request: ScopeRequest): Promise<SuggestionAnswer> {
  const scope = await activeScopeOf(db, org, deliverableId);
  if (!scope?.lines.length) return { status: "no-scope" };
  const lines = scope.lines.map((line) => ({ id: String(line.id), title: lineLabel(line) }));
  const exclusions = scope.exclusions.map((exclusion) => ({ id: `x${exclusion.id}`, title: exclusion.title }));
  const suggestion = await suggestQualification(model, lines, request, exclusions);
  if (!suggestion) return { status: "none" };
  const line = suggestion.lineId ? scope.lines.find((candidate) => String(candidate.id) === suggestion.lineId) : undefined;
  return {
    status: "ready",
    suggestion: { decision: suggestion.decision, reason: suggestion.reason, ...(suggestion.title ? { title: suggestion.title } : {}), ...(line ? { line: { id: line.id, title: lineLabel(line) } } : {}) },
  };
}
