"use client";

import { useState } from "react";
import { Eye, History, MessageSquare, Plus, Share2 } from "lucide-react";
import type { ProposalStage } from "./CanvasComments";
import { ResizeHandle } from "./ResizeHandle";
import { kindLabels, requestKind, requestText, timeLabel, useNow, type RequestKind, type ThreadComment } from "./CanvasComments";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";

export type InspectorTab = RequestKind;

const tabs: { kind: RequestKind; label: string; empty: string }[] = [
  { kind: "comment", label: "À clarifier", empty: "Aucun commentaire à clarifier. Commentez le livrable sur le canevas, ou ajoutez-en un avec +." },
  { kind: "correction", label: "À traiter", empty: "Aucune demande à traiter. Créez-en une depuis un commentaire quand elle fait partie du scope." },
  { kind: "outside", label: "Hors scope", empty: "Aucune demande hors scope. Créez-en une depuis un commentaire pour la chiffrer." },
];

/** Markdown summary of every request of the version (copy / export). */
export function threadsToMarkdown(title: string, comments: ThreadComment[]) {
  const section = (kind: RequestKind, label: string) => {
    const list = comments.filter((comment) => requestKind(comment) === kind);
    if (list.length === 0) return "";
    return `## ${label}\n\n${list
      .map((comment) =>
        [
          `- **#${comment.id} · ${requestText(comment)}** (${comment.location})${comment.description ? `\n  ${comment.description}` : ""}`,
          `  - ${comment.author} : ${comment.message}`,
          ...(comment.replies ?? []).map((reply) => `  - ${reply.author} : ${reply.message}`),
        ].join("\n"),
      )
      .join("\n")}\n\n`;
  };
  return `# ${title}\n\n${section("correction", "À traiter")}${section("outside", "Hors scope")}${section("comment", "À clarifier")}`.trim() + "\n";
}

/**
 * Requests of a version in three tabs (À clarifier · À traiter · Hors scope), with a manual comment form.
 * Used by the agency inspector and by the client page.
 */
export function RequestPanel({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalStage,
  onQuote,
  onSendProposal,
  onOpenProposal,
  onRequote,
  proposalSummary,
  unread,
  adding,
  onAddingChange,
  onAddComment,
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Shows that request on the canvas. */
  onFocus: (commentId: number) => void;
  /** Out-of-scope requests (agency only): where the proposal stands, and its actions. */
  proposalStage?: (comment: ThreadComment) => ProposalStage | null;
  onQuote?: (commentId: number) => void;
  onSendProposal?: (commentId: number) => void;
  onOpenProposal?: (commentId: number) => void;
  /** Refused proposal: quote a new version (the refused one stays in the history). */
  onRequote?: (commentId: number) => void;
  /** Out-of-scope requests: amount, delay and where the decision stands, above the actions. */
  proposalSummary?: (comment: ThreadComment) => React.ReactNode;
  /** Has news the reader hasn't opened yet (a reply, a proposal): dot on the row and its tab. */
  unread?: (comment: ThreadComment) => boolean;
  /** The manual comment form is open (opened from the panel header's "+"). */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Adds a comment by hand (not tied to a spot of the canvas); absent when read-only. */
  onAddComment?: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const now = useNow();
  const count = (kind: RequestKind) => comments.filter((comment) => requestKind(comment) === kind).length;
  const hasUnread = (kind: RequestKind) => Boolean(unread) && comments.some((comment) => requestKind(comment) === kind && unread?.(comment));
  const list = comments.filter((comment) => requestKind(comment) === tab).sort((left, right) => right.id - left.id);
  const current = tabs.find((option) => option.kind === tab) ?? tabs[0];

  return (
    <>
      <div className="inspector-tabs" role="tablist" aria-label="Demandes">
        {tabs.map((option) => (
          <button key={option.kind} role="tab" aria-selected={tab === option.kind} className={tab === option.kind ? "is-active" : ""} onClick={() => onTab(option.kind)}>
            {option.label} <span>{count(option.kind)}</span>
            {hasUnread(option.kind) && <i className="unread-dot" aria-label="Nouvelle réponse" />}
          </button>
        ))}
      </div>

      {adding && onAddComment && (
        <form
          className="manual-comment"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onAddComment(draft.trim());
            setDraft("");
            onAddingChange(false);
            onTab("comment");
          }}
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onAddingChange(false);
            }}
            rows={3}
            placeholder="Un retour sur le livrable dans son ensemble…"
            aria-label="Nouveau commentaire"
          />
          <div className="manual-comment-actions">
            <button type="button" className="ghost-button" onClick={() => onAddingChange(false)}>
              Annuler
            </button>
            <button type="submit" className="primary-button" disabled={!draft.trim()}>
              Ajouter
            </button>
          </div>
        </form>
      )}

      <div className="inspector-list" role="tabpanel">
        {list.length === 0 ? (
          <div className="inspector-empty-state">
            <MessageSquare aria-hidden="true" />
            <p>{current.empty}</p>
          </div>
        ) : (
          <ul>
            {list.map((comment) => {
              const kind = requestKind(comment);
              return (
                <li key={comment.id} className={`inspector-row ${comment.id === selectedId ? "is-selected" : ""}`}>
                  <button
                    className={`thread-row ${comment.id === selectedId ? "is-selected" : ""}`}
                    aria-current={comment.id === selectedId ? "true" : undefined}
                    aria-label={`${kindLabels[kind]} #${comment.id}`}
                    onClick={() => onFocus(comment.id)}
                  >
                    <span className={`thread-avatar ${comment.initials === "AM" ? "is-agency" : "is-client"}`} aria-hidden="true">
                      {comment.initials}
                    </span>
                    <span className="thread-row-body">
                      <span className="thread-row-meta">
                        <span className="inline-flex items-center gap-1.5">
                          {unread?.(comment) && <i className="unread-dot" aria-label="Nouvelle réponse" />}
                          {comment.author}
                        </span>
                        {timeLabel(comment, now) && <small>{timeLabel(comment, now)}</small>}
                      </span>
                      <span className={`thread-row-text ${kind !== "comment" ? "is-title" : ""}`}>{requestText(comment)}</span>
                      {(comment.replies?.length ?? 0) > 0 && (
                        <span className="thread-row-tags">
                          <small>
                            {comment.replies?.length} réponse{(comment.replies?.length ?? 0) > 1 ? "s" : ""}
                          </small>
                        </span>
                      )}
                    </span>
                  </button>
                  {kind === "outside" &&
                    (() => {
                      const stage = proposalStage?.(comment);
                      if (!stage) return null;
                      return (
                        <div className="row-actions">
                          {proposalSummary?.(comment)}
                          {stage.stage === "sent" && stage.retry ? (
                            <span className="row-buttons">
                              {onRequote && (
                                <>
                                  <button type="button" className="secondary-button small-button" onClick={() => onRequote(comment.id)}>
                                    Chiffrer
                                  </button>
                                  <button type="button" className="secondary-button small-button" disabled title="Chiffrez d’abord la nouvelle proposition">
                                    Envoyer la proposition
                                  </button>
                                </>
                              )}
                              <Hint label="Historique de la proposition">
                                <Button variant="outline" size="icon-sm" className="ml-auto shrink-0" aria-label="Historique de la proposition" onClick={() => onOpenProposal?.(comment.id)}>
                                  <History />
                                </Button>
                              </Hint>
                            </span>
                          ) : stage.stage === "sent" ? (
                            <button type="button" className="secondary-button small-button" onClick={() => onOpenProposal?.(comment.id)}>
                              {stage.label}
                            </button>
                          ) : (
                            <>
                              <button type="button" className="secondary-button small-button" onClick={() => onQuote?.(comment.id)}>
                                {stage.stage === "draft" ? "Modifier" : "Chiffrer"}
                              </button>
                              <button
                                type="button"
                                className="secondary-button small-button"
                                disabled={stage.stage !== "draft"}
                                title={stage.stage === "draft" ? undefined : "Chiffrez d’abord la demande"}
                                onClick={() => onSendProposal?.(comment.id)}
                              >
                                Envoyer la proposition
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Right panel of the deliverable: where requests are handled.
 * Header: "Demandes", add a comment, client preview, share. Copy / export live in the canvas toolbar.
 */
export function EditorInspector({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalStage,
  onQuote,
  onSendProposal,
  onOpenProposal,
  onRequote,
  proposalSummary,
  onAddComment,
  onShare,
  onPreview,
  width,
  onResize,
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onFocus: (commentId: number) => void;
  proposalStage: (comment: ThreadComment) => ProposalStage | null;
  onQuote: (commentId: number) => void;
  onSendProposal: (commentId: number) => void;
  onOpenProposal: (commentId: number) => void;
  onRequote: (commentId: number) => void;
  proposalSummary: (comment: ThreadComment) => React.ReactNode;
  onAddComment?: (message: string) => void;
  onShare: () => void;
  onPreview: () => void;
  width: number;
  onResize: (width: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <aside className="inspector editor-inspector" aria-label="Demandes">
      <ResizeHandle edge="left" width={width} min={300} max={560} defaultWidth={340} label="Largeur du panneau des demandes" onResize={onResize} />
      <header className="requests-header">
        <h2>Demandes</h2>
        <div className="requests-actions">
          <Hint label="Aperçu : la page que voit le client">
            <Button variant="outline" size="icon" className="icon-action" onClick={onPreview} aria-label="Aperçu client">
              <Eye />
            </Button>
          </Hint>
          <Hint label="Partager la revue avec le client">
            <Button variant="outline" size="icon" className="icon-action" onClick={onShare} aria-label="Partager la revue">
              <Share2 />
            </Button>
          </Hint>
          {onAddComment && (
            <Hint label="Un retour général, sans le placer sur le livrable">
              <Button className="requests-add" onClick={() => setAdding(true)}>
                <Plus /> Commentaire
              </Button>
            </Hint>
          )}
        </div>
      </header>

      <RequestPanel
        comments={comments}
        selectedId={selectedId}
        tab={tab}
        onTab={onTab}
        onFocus={onFocus}
        proposalStage={proposalStage}
        onQuote={onQuote}
        onSendProposal={onSendProposal}
        onOpenProposal={onOpenProposal}
        onRequote={onRequote}
        proposalSummary={proposalSummary}
        adding={adding}
        onAddingChange={setAdding}
        onAddComment={onAddComment}
      />
    </aside>
  );
}
