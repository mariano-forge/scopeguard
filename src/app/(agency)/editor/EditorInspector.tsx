"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, MessageSquare, Plus, Share2 } from "lucide-react";
import { kindLabels, requestKind, requestText, statusLabels, statusTones, type RequestKind, type ThreadComment } from "./CanvasComments";

export type InspectorTab = RequestKind;

const tabs: { kind: RequestKind; label: string; empty: string }[] = [
  { kind: "comment", label: "À clarifier", empty: "Aucun commentaire à clarifier. Commentez le livrable sur le canevas, ou ajoutez-en un ici." },
  { kind: "correction", label: "Corrections", empty: "Aucune correction. Qualifiez un commentaire « Correction » quand il fait partie du scope." },
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
  return `# ${title}\n\n${section("correction", "Corrections")}${section("outside", "Hors scope")}${section("comment", "À clarifier")}`.trim() + "\n";
}

/**
 * Requests of a version in three tabs (À clarifier · Corrections · Hors scope), with a manual comment form.
 * Used by the agency inspector and by the client page.
 */
export function RequestPanel({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalLabel,
  onAddComment,
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Shows that request on the canvas. */
  onFocus: (commentId: number) => void;
  proposalLabel?: (comment: ThreadComment) => string | null;
  /** Adds a comment by hand (not tied to a spot of the canvas); absent when read-only. */
  onAddComment?: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
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

      <div className="inspector-list" role="tabpanel">
        {tab === "comment" && onAddComment && (
          <div className="manual-comment">
            {adding ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!draft.trim()) return;
                  onAddComment(draft.trim());
                  setDraft("");
                  setAdding(false);
                }}
              >
                <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Un retour sur le livrable dans son ensemble…" aria-label="Nouveau commentaire" />
                <div className="manual-comment-actions">
                  <button type="button" className="ghost-button" onClick={() => setAdding(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="primary-button" disabled={!draft.trim()}>
                    Ajouter
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="manual-comment-trigger" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" /> Commentaire
              </button>
            )}
          </div>
        )}
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

export function EditorInspector({
  title,
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalLabel,
  onAddComment,
  versionLabel,
  versionChip,
  validation,
  onShare,
  onPreview,
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
  versionLabel: string;
  versionChip?: { label: string; tone: string };
  validation: string;
  onShare: () => void;
  onPreview: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(threadsToMarkdown(title, comments));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused (permissions): export stays available.
    }
  }
  function exportFile() {
    const url = URL.createObjectURL(new Blob([threadsToMarkdown(title, comments)], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-demandes.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="inspector editor-inspector" aria-label="Partage et demandes">
      <div className="inspector-top">
        <button className="inspector-primary" onClick={onShare}>
          <Share2 /> Partager
        </button>
        <button className="secondary-button inspector-preview" onClick={onPreview} title="Ouvrir la page que voit le client">
          <Eye /> Aperçu client
        </button>
      </div>

      <section className="inspector-version">
        <div className="inspector-heading">
          <h2>{versionLabel}</h2>
          {versionChip && <span className={`chip chip-${versionChip.tone}`}>{versionChip.label}</span>}
        </div>
        <p className="inspector-meta">{validation}</p>
      </section>

      <RequestPanel
        comments={comments}
        selectedId={selectedId}
        tab={tab}
        onTab={onTab}
        onFocus={onFocus}
        proposalLabel={proposalLabel}
        onAddComment={onAddComment}
      />

      <div className="inspector-footer">
        <button className="ghost-button" onClick={copy} disabled={comments.length === 0}>
          {copied ? <Check /> : <Copy />} {copied ? "Copié" : "Copier"}
        </button>
        <button className="ghost-button" onClick={exportFile} disabled={comments.length === 0}>
          <Download /> Exporter
        </button>
      </div>
    </aside>
  );
}
