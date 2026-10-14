"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, Trash2, X } from "lucide-react";

export type Qualification = "À qualifier" | "Inclus" | "Hors périmètre";
export const qualifications: { value: Qualification; label: string }[] = [
  { value: "Inclus", label: "Incluse" },
  { value: "Hors périmètre", label: "Hors périmètre" },
  { value: "À qualifier", label: "À clarifier" },
];

type ThreadReply = { id: number; author: string; initials: string; message: string; time: string };
export type ThreadComment = {
  id: number;
  author: string;
  initials: string;
  time: string;
  message: string;
  location: string;
  decision: Qualification;
  /** Created as a request (qualified up front) or as a remark. */
  kind?: "remark" | "request";
  position?: { x: number; y: number };
  replies?: ThreadReply[];
};

/** Hovered zone in comment mode, in % of the page box. */
export type TargetBox = { left: number; top: number; width: number; height: number; label: string };

const side = (x: number) => (x > 58 ? "is-left" : "is-right");
const vertical = (y: number) => (y > 62 ? "is-up" : "");

export function CommentPin({
  comment,
  active,
  onOpen,
}: {
  comment: ThreadComment;
  active: boolean;
  onOpen: () => void;
}) {
  const tone = comment.decision === "Hors périmètre" ? "is-scope" : comment.decision === "Inclus" ? "is-included" : "is-open";
  return (
    <button
      type="button"
      data-pin={comment.id}
      className={`canvas-pin ${tone} ${active ? "is-active" : ""} ${comment.initials === "AM" ? "is-agency" : "is-client"}`}
      style={{ left: `${comment.position?.x ?? 50}%`, top: `${comment.position?.y ?? 50}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`Fil #${comment.id} de ${comment.author} : ${comment.message}`}
      aria-expanded={active}
    >
      <span>{comment.initials}</span>
    </button>
  );
}

/** Figma-like thread bubble next to its pin: the conversation, a reply box and the qualification. */
export function ThreadPopover({
  comment,
  readOnly,
  locked,
  proposalLabel,
  onReply,
  onQualify,
  onOpenProposal,
  onDelete,
  onClose,
}: {
  comment: ThreadComment;
  readOnly: boolean;
  /** Decision locked by an accepted/refused proposal. */
  locked: boolean;
  proposalLabel: string | null;
  onReply: (message: string) => void;
  onQualify: (decision: Qualification) => void;
  onOpenProposal: () => void;
  /** Only for the agency's own threads that are still open. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const x = comment.position?.x ?? 50;
  const y = comment.position?.y ?? 50;
  const canWrite = !readOnly && !locked;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comment.replies?.length]);

  const messages = [
    { id: 0, author: comment.author, initials: comment.initials, message: comment.message, time: comment.time },
    ...(comment.replies ?? []),
  ];
  return (
    <div
      className={`thread ${side(x)} ${vertical(y)}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      role="dialog"
      aria-label={`Fil #${comment.id}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="thread-header">
        <span className="thread-title">
          #{comment.id}
          <small>{comment.location}</small>
        </span>
        <span className="thread-header-actions">
          {onDelete && (
            <button type="button" className="thread-icon-button" onClick={onDelete} aria-label="Supprimer le fil" title="Supprimer le fil">
              <Trash2 />
            </button>
          )}
          <button type="button" className="thread-icon-button" onClick={onClose} aria-label="Fermer le fil">
            <X />
          </button>
        </span>
      </header>

      <div className="thread-messages" ref={listRef}>
        {messages.map((message) => (
          <div key={message.id} className={`thread-message ${message.initials === "AM" ? "is-agency" : "is-client"}`}>
            <span className="thread-avatar" aria-hidden="true">
              {message.initials}
            </span>
            <div>
              <p className="thread-meta">
                <b>{message.author}</b> <small>{message.time}</small>
              </p>
              <p className="thread-text">{message.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="thread-qualify" role="group" aria-label="Qualifier la demande">
        {qualifications.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`qualify-chip qualify-${option.value === "Inclus" ? "included" : option.value === "Hors périmètre" ? "scope" : "clarify"} ${comment.decision === option.value ? "is-selected" : ""}`}
            aria-pressed={comment.decision === option.value}
            disabled={!canWrite}
            onClick={() => onQualify(option.value)}
          >
            {comment.decision === option.value && <Check aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
      {comment.decision === "Hors périmètre" && (
        <button type="button" className="thread-proposal" onClick={onOpenProposal} disabled={readOnly}>
          {proposalLabel ?? "Créer une proposition"} <ArrowRight aria-hidden="true" />
        </button>
      )}

      {canWrite ? (
        <form
          className="thread-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onReply(draft.trim());
            setDraft("");
          }}
        >
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Répondre…" aria-label="Répondre dans le fil" />
          <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Envoyer la réponse">
            <ArrowUp />
          </button>
        </form>
      ) : (
        <p className="thread-locked">{readOnly ? "Version en lecture seule." : "Décision verrouillée par la proposition."}</p>
      )}
    </div>
  );
}

/** Where a new remark / request is typed, right where the canvas was clicked. */
export function Composer({
  x,
  y,
  mode,
  target,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  /** A request is qualified right away; a remark starts "à clarifier". */
  mode: "remark" | "request";
  target: string;
  onSubmit: (message: string, decision: Qualification) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [decision, setDecision] = useState<Qualification | null>(mode === "remark" ? "À qualifier" : null);
  const ready = draft.trim() && decision;
  return (
    <>
    <span className="composer-pin" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
    <div
      className={`thread composer ${side(x)} ${vertical(y)}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <header className="thread-header">
        <span className="thread-title">
          {mode === "remark" ? "Nouvelle remarque" : "Nouvelle demande"}
          <small>{target}</small>
        </span>
        <button type="button" className="thread-icon-button" onClick={onCancel} aria-label="Annuler">
          <X />
        </button>
      </header>
      {mode === "request" && (
        <div className="thread-qualify" role="group" aria-label="Qualification de la demande">
          {qualifications.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`qualify-chip qualify-${option.value === "Inclus" ? "included" : option.value === "Hors périmètre" ? "scope" : "clarify"} ${decision === option.value ? "is-selected" : ""}`}
              aria-pressed={decision === option.value}
              onClick={() => setDecision(option.value)}
            >
              {decision === option.value && <Check aria-hidden="true" />}
              {option.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="thread-reply"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSubmit(draft.trim(), decision);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={mode === "remark" ? "Écrire une remarque…" : "Décrire la demande…"}
          aria-label={mode === "remark" ? "Remarque" : "Demande"}
        />
        <button type="submit" className="thread-send" disabled={!ready} aria-label="Publier">
          <ArrowUp />
        </button>
      </form>
      {mode === "request" && !decision && <p className="thread-locked">Choisissez d’abord une qualification.</p>}
    </div>
    </>
  );
}

/** Blue outline on the zone under the pointer (comment tools), like Agentation. */
export function TargetHighlight({ box }: { box: TargetBox }) {
  return (
    <div
      className="target-highlight"
      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
      aria-hidden="true"
    >
      <span>{box.label}</span>
    </div>
  );
}

/** Human label for a hovered element: "Bouton « Nous contacter »", "Titre « Des idées… »". */
export function describeTarget(element: Element): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  const short = text.length > 32 ? `${text.slice(0, 32)}…` : text;
  const tag = element.tagName.toLowerCase();
  const kind =
    tag === "button" || tag === "a"
      ? "Bouton"
      : /^h[1-6]$/.test(tag)
        ? "Titre"
        : tag === "img" || tag === "svg"
          ? "Image"
          : tag === "nav"
            ? "Navigation"
            : tag === "p" || tag === "small" || tag === "span" || tag === "em" || tag === "b"
              ? "Texte"
              : "Zone";
  return short && kind !== "Image" ? `${kind} « ${short} »` : kind;
}
