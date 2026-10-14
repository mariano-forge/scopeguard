"use client";

import { useState } from "react";
import { Copy, Download, Eye, MessageSquare, MoreHorizontal, Plus, Share2 } from "lucide-react";
import { MenuButton } from "./MenuButton";
import { ResizeHandle } from "./ResizeHandle";
import { kindLabels, requestKind, requestText, statusLabels, statusTones, type RequestKind, type ThreadComment } from "./CanvasComments";

export type InspectorTab = RequestKind;

const tabs: { kind: RequestKind; label: string; empty: string }[] = [
  { kind: "comment", label: "À clarifier", empty: "Aucun commentaire à clarifier. Commentez le livrable sur le canevas, ou ajoutez-en un ici." },
  { kind: "correction", label: "Inclus", empty: "Aucune demande incluse. Qualifiez un commentaire « Inclus » quand il fait partie du scope." },
  { kind: "outside", label: "Hors scope", empty: "Aucun ajout hors scope. Qualifiez un commentaire « Hors scope » pour le chiffrer." },
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
  return `# ${title}\n\n${section("correction", "Inclus")}${section("outside", "Hors scope")}${section("comment", "À clarifier")}`.trim() + "\n";
}

/**
 * Requests of a version in three tabs (À clarifier · Inclus · Hors scope), with a manual comment form.
 * Used by the agency inspector and by the client page.
 */
export function RequestPanel({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalLabel,
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
  proposalLabel?: (comment: ThreadComment) => string | null;
  /** The manual comment form is open (opened from the panel header's "+"). */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Adds a comment by hand (not tied to a spot of the canvas); absent when read-only. */
  onAddComment?: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const count = (kind: RequestKind) => comments.filter((comment) => requestKind(comment) === kind).length;
  const list = comments.filter((comment) => requestKind(comment) === tab).sort((left, right) => right.id - left.id);
  const current = tabs.find((option) => option.kind === tab) ?? tabs[0];

  return (
    <>
      <div className="inspector-tabs" role="tablist" aria-label="Demandes">
        {tabs.map((option) => (
          <button key={option.kind} role="tab" aria-selected={tab === option.kind} className={tab === option.kind ? "is-active" : ""} onClick={() => onTab(option.kind)}>
            {option.label} <span>{count(option.kind)}</span>
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
                <li key={comment.id}>
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
                        <b>{comment.author}</b>
                        <small>
                          #{comment.id} · {comment.time}
                        </small>
                      </span>
                      <span className={`thread-row-text ${kind !== "comment" ? "is-title" : ""}`}>{requestText(comment)}</span>
                      <span className="thread-row-tags">
                        <span className={`decision-badge ${statusTones[kind]}`}>{statusLabels[kind]}</span>
                        {kind === "outside" && proposalLabel?.(comment) && <small>{proposalLabel(comment)}</small>}
                        {(comment.replies?.length ?? 0) > 0 && (
                          <small>
                            {comment.replies?.length} réponse{(comment.replies?.length ?? 0) > 1 ? "s" : ""}
                          </small>
                        )}
                      </span>
                    </span>
                  </button>
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
 * Header: "Demandes" + add a comment, share, client preview, and copy / export in "⋯".
 */
export function EditorInspector({
  title,
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalLabel,
  onAddComment,
  onShare,
  onPreview,
  width,
  onResize,
}: {
  /** "Livrable — V03", used by copy / export. */
  title: string;
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onFocus: (commentId: number) => void;
  proposalLabel: (comment: ThreadComment) => string | null;
  onAddComment?: (message: string) => void;
  onShare: () => void;
  onPreview: () => void;
  width: number;
  onResize: (width: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const toClarify = comments.filter((comment) => requestKind(comment) === "comment").length;

  function exportFile() {
    const url = URL.createObjectURL(new Blob([threadsToMarkdown(title, comments)], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-demandes.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="inspector editor-inspector" aria-label="Demandes">
      <ResizeHandle edge="left" width={width} min={300} max={560} defaultWidth={340} label="Largeur du panneau des demandes" onResize={onResize} />
      <header className="requests-header">
        <div className="requests-heading">
          <h2>Demandes</h2>
          <p>{toClarify > 0 ? `${toClarify} commentaire${toClarify > 1 ? "s" : ""} à clarifier` : "Tout est qualifié"}</p>
        </div>
        <div className="requests-actions">
          {onAddComment && (
            <button className="icon-action" onClick={() => setAdding(true)} aria-label="Ajouter un commentaire" title="Ajouter un commentaire">
              <Plus />
            </button>
          )}
          <button className="icon-action" onClick={onPreview} aria-label="Aperçu client" title="Aperçu client : la page que voit le client">
            <Eye />
          </button>
          <MenuButton
            className="icon-action"
            label="Plus d’actions"
            trigger={<MoreHorizontal />}
            menuClassName="requests-menu"
            entries={[
              { label: "Copier les demandes", icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(threadsToMarkdown(title, comments)), disabled: comments.length === 0 },
              { label: "Exporter (.md)", icon: <Download />, onSelect: exportFile, disabled: comments.length === 0 },
            ]}
          />
          <button className="primary-button requests-share" onClick={onShare}>
            <Share2 /> Partager
          </button>
        </div>
      </header>

      <RequestPanel
        comments={comments}
        selectedId={selectedId}
        tab={tab}
        onTab={onTab}
        onFocus={onFocus}
        proposalLabel={proposalLabel}
        adding={adding}
        onAddingChange={setAdding}
        onAddComment={onAddComment}
      />
    </aside>
  );
}
