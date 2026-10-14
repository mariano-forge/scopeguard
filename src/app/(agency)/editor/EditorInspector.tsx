"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, MessageSquare, Share2 } from "lucide-react";
import type { ThreadComment } from "./CanvasComments";

export type InspectorTab = "remarques" | "demandes";

/** A remark becomes a request once qualified (or when it was created as one). */
export const isRequest = (comment: ThreadComment) =>
  comment.kind === "request" || comment.decision !== "À qualifier";

const decisionLabel = { "À qualifier": "À clarifier", Inclus: "Incluse", "Hors périmètre": "Hors périmètre" } as const;
const decisionTone = { "À qualifier": "decision-pending", Inclus: "decision-included", "Hors périmètre": "decision-outside" } as const;

/** Markdown summary of every thread of the version (copy / export). */
export function threadsToMarkdown(title: string, comments: ThreadComment[]) {
  const block = (label: string, list: ThreadComment[]) =>
    list.length === 0
      ? ""
      : `## ${label}\n\n${list
          .map((comment) =>
            [
              `- **#${comment.id} · ${decisionLabel[comment.decision]}** — ${comment.author} (${comment.location}) : ${comment.message}`,
              ...(comment.replies ?? []).map((reply) => `  - ${reply.author} : ${reply.message}`),
            ].join("\n"),
          )
          .join("\n")}\n\n`;
  return `# ${title}\n\n${block("Demandes", comments.filter(isRequest))}${block("Remarques", comments.filter((comment) => !isRequest(comment)))}`.trim() + "\n";
}

export function EditorInspector({
  title,
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalLabel,
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
  /** Shows that thread on the canvas. */
  onFocus: (commentId: number) => void;
  proposalLabel: (comment: ThreadComment) => string | null;
  versionLabel: string;
  versionChip?: { label: string; tone: string };
  validation: string;
  onShare: () => void;
  onPreview: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const requests = comments.filter(isRequest);
  const remarks = comments.filter((comment) => !isRequest(comment));
  const list = [...(tab === "demandes" ? requests : remarks)].sort((left, right) => right.id - left.id);

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
    link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-commentaires.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="inspector editor-inspector" aria-label="Partage et fils de discussion">
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

      <div className="inspector-tabs" role="tablist" aria-label="Historique">
        <button role="tab" aria-selected={tab === "remarques"} className={tab === "remarques" ? "is-active" : ""} onClick={() => onTab("remarques")}>
          Remarques <span>{remarks.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "demandes"} className={tab === "demandes" ? "is-active" : ""} onClick={() => onTab("demandes")}>
          Demandes <span>{requests.length}</span>
        </button>
      </div>

      <div className="inspector-list" role="tabpanel">
        {list.length === 0 ? (
          <div className="inspector-empty-state">
            <MessageSquare aria-hidden="true" />
            <p>
              {tab === "remarques"
                ? "Aucune remarque. Choisissez l’outil Remarque (C) et cliquez sur le livrable."
                : "Aucune demande. Qualifiez une remarque ou utilisez l’outil Demande (D)."}
            </p>
          </div>
        ) : (
          <ul>
            {list.map((comment) => (
              <li key={comment.id}>
                <button
                  className={`thread-row ${comment.id === selectedId ? "is-selected" : ""}`}
                  aria-current={comment.id === selectedId ? "true" : undefined}
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
                    <span className="thread-row-text">{comment.message}</span>
                    <span className="thread-row-tags">
                      <span className={`decision-badge ${decisionTone[comment.decision]}`}>{decisionLabel[comment.decision]}</span>
                      {proposalLabel(comment) && <small>{proposalLabel(comment)}</small>}
                      {(comment.replies?.length ?? 0) > 0 && (
                        <small>
                          {comment.replies?.length} réponse{(comment.replies?.length ?? 0) > 1 ? "s" : ""}
                        </small>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
