"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, ClipboardCheck, Trash2, X } from "lucide-react";

export type Qualification = "À qualifier" | "Inclus" | "Hors périmètre";
export const qualifications: { value: Qualification; label: string }[] = [
  { value: "Inclus", label: "Incluse" },
  { value: "Hors périmètre", label: "Hors périmètre" },
  { value: "À qualifier", label: "À clarifier" },
];

type ThreadReply = { id: number; author: string; initials: string; message: string; time: string };
/** Rectangle drawn on a page, in % of the page box. */
export type Area = { x: number; y: number; w: number; h: number };
export type ThreadComment = {
  id: number;
  author: string;
  initials: string;
  time: string;
  /** Remark text, or the description of a correction. */
  message: string;
  /** Short title of a correction. */
  title?: string;
  location: string;
  decision: Qualification;
  /** "request" = correction (clear, qualified work item); otherwise a remark (conversation). */
  kind?: "remark" | "request";
  /** Remark a correction was written from. */
  sourceId?: number;
  position?: { x: number; y: number };
  area?: Area;
  replies?: ThreadReply[];
};

/** A correction is a clear work item with a qualification; a remark is only a conversation. */
export const isCorrection = (comment: Pick<ThreadComment, "kind" | "decision">) =>
  comment.kind === "request" || (comment.kind === undefined && comment.decision !== "À qualifier");

/** Hovered zone with a comment tool, in % of the page box. */
export type TargetBox = { left: number; top: number; width: number; height: number; label: string };

const side = (x: number) => (x > 58 ? "is-left" : "is-right");
const vertical = (y: number) => (y > 62 ? "is-up" : "");

/** Opens the bubble on the side where it fits in the visible canvas (flips when it would be cut off). */
function useFittingSide(x: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(side(x));
  // Flip at most once: when neither side fits (narrow canvas), keep the second one instead of looping.
  const flipped = useRef(false);
  useLayoutEffect(() => {
    const bubble = ref.current;
    const frame = bubble?.closest(".artboard-transform-wrapper");
    if (!bubble || !frame || flipped.current) return;
    const box = bubble.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    const overflow = placement === "is-right" ? box.right > bounds.right : box.left < bounds.left;
    if (!overflow) return;
    flipped.current = true;
    setPlacement(placement === "is-right" ? "is-left" : "is-right");
  }, [placement]);
  return [ref, placement] as const;
}
const toneOf = (decision: Qualification) => (decision === "Hors périmètre" ? "scope" : decision === "Inclus" ? "included" : "clarify");

export function CommentPin({ comment, active, onOpen }: { comment: ThreadComment; active: boolean; onOpen: () => void }) {
  const correction = isCorrection(comment);
  return (
    <button
      type="button"
      data-pin={comment.id}
      className={`canvas-pin ${correction ? `is-correction is-${toneOf(comment.decision)}` : "is-remark"} ${active ? "is-active" : ""} ${comment.initials === "AM" ? "is-agency" : "is-client"}`}
      style={{ left: `${comment.position?.x ?? 50}%`, top: `${comment.position?.y ?? 50}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={correction ? `Correction #${comment.id} : ${comment.title ?? comment.message}` : `Remarque #${comment.id} de ${comment.author} : ${comment.message}`}
      aria-expanded={active}
    >
      {correction ? <ClipboardCheck aria-hidden="true" /> : <span>{comment.initials}</span>}
    </button>
  );
}

function QualificationChips({
  value,
  disabled,
  onChange,
}: {
  value: Qualification | null;
  disabled?: boolean;
  onChange: (value: Qualification) => void;
}) {
  return (
    <div className="thread-qualify" role="radiogroup" aria-label="Qualification">
      {qualifications.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`qualify-chip qualify-${toneOf(option.value)} ${value === option.value ? "is-selected" : ""}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && <Check aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Bubble next to its pin (Figma-like).
 * Remark: the conversation, a reply box, and "Créer une correction".
 * Correction: title, description, qualification (and proposal when out of scope), then its discussion.
 */
export function ThreadPopover({
  comment,
  readOnly,
  locked,
  proposalLabel,
  linkedCorrection,
  onReply,
  onQualify,
  onOpenProposal,
  onCreateCorrection,
  onOpenThread,
  onDelete,
  onClose,
}: {
  comment: ThreadComment;
  readOnly: boolean;
  /** Decision locked by an accepted/refused proposal. */
  locked: boolean;
  proposalLabel: string | null;
  /** Correction already written from this remark. */
  linkedCorrection?: { id: number; title: string };
  onReply: (message: string) => void;
  onQualify?: (decision: Qualification) => void;
  onOpenProposal?: () => void;
  /** Writes a correction from this remark (agency only). */
  onCreateCorrection?: () => void;
  onOpenThread?: (commentId: number) => void;
  /** Only for the agency's own threads that are still open. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const x = comment.position?.x ?? 50;
  const y = comment.position?.y ?? 50;
  const [bubbleRef, placement] = useFittingSide(x);
  const correction = isCorrection(comment);
  const canWrite = !readOnly && !locked;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comment.replies?.length]);

  const messages = correction
    ? (comment.replies ?? [])
    : [{ id: 0, author: comment.author, initials: comment.initials, message: comment.message, time: comment.time }, ...(comment.replies ?? [])];
  return (
    <div
      ref={bubbleRef}
      className={`thread ${correction ? "is-correction" : ""} ${placement} ${vertical(y)}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      role="dialog"
      aria-label={correction ? `Correction #${comment.id}` : `Remarque #${comment.id}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="thread-header">
        <span className="thread-title">
          {correction ? `Correction #${comment.id}` : `Remarque #${comment.id}`}
          <small>{comment.location}</small>
        </span>
        <span className="thread-header-actions">
          {onDelete && (
            <button type="button" className="thread-icon-button" onClick={onDelete} aria-label="Supprimer" title="Supprimer">
              <Trash2 />
            </button>
          )}
          <button type="button" className="thread-icon-button" onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </span>
      </header>

      {correction && (
        <div className="correction-body">
          <p className="correction-title">{comment.title ?? comment.message}</p>
          {comment.title && <p className="correction-description">{comment.message}</p>}
          <p className="thread-meta">
            <small>
              {comment.author} · {comment.time}
            </small>
          </p>
          {onQualify ? (
            <QualificationChips value={comment.decision} disabled={!canWrite} onChange={onQualify} />
          ) : (
            <span className={`qualify-chip qualify-${toneOf(comment.decision)} is-selected is-static`}>
              {qualifications.find((option) => option.value === comment.decision)?.label}
            </span>
          )}
          {comment.decision === "Hors périmètre" && onOpenProposal && (
            <button type="button" className="thread-proposal" onClick={onOpenProposal} disabled={readOnly}>
              {proposalLabel ?? "Faire une proposition"} <ArrowRight aria-hidden="true" />
            </button>
          )}
          {comment.sourceId && onOpenThread && (
            <button type="button" className="thread-link" onClick={() => onOpenThread(comment.sourceId ?? 0)}>
              Issue de la remarque #{comment.sourceId}
            </button>
          )}
        </div>
      )}

      {messages.length > 0 && (
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
      )}

      {!correction && (linkedCorrection || onCreateCorrection) && (
        <div className="thread-actions">
          {linkedCorrection ? (
            <button type="button" className="thread-link" onClick={() => onOpenThread?.(linkedCorrection.id)}>
              <ClipboardCheck aria-hidden="true" /> Correction #{linkedCorrection.id} : {linkedCorrection.title}
            </button>
          ) : (
            <button type="button" className="secondary-button thread-create" onClick={onCreateCorrection} disabled={readOnly}>
              <ClipboardCheck aria-hidden="true" /> Créer une correction
            </button>
          )}
        </div>
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
          <input
            autoFocus={!correction}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={correction ? "Commenter la correction…" : "Répondre…"}
            aria-label="Répondre"
          />
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

export type ComposerResult = { message: string; title?: string; decision: Qualification };

/**
 * Where a remark or a correction is written, right where the canvas was clicked (or the area drawn).
 * A correction is a small form: title, description, qualification (Incluse by default).
 */
export function Composer({
  x,
  y,
  mode,
  target,
  initialTitle = "",
  initialDescription = "",
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  mode: "remark" | "correction";
  target: string;
  initialTitle?: string;
  initialDescription?: string;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialDescription);
  const [title, setTitle] = useState(initialTitle);
  const [decision, setDecision] = useState<Qualification>("Inclus");
  const [bubbleRef, placement] = useFittingSide(x);
  return (
    <>
      <span className="composer-pin" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
      <div
        ref={bubbleRef}
        className={`thread composer ${mode === "correction" ? "is-correction" : ""} ${placement} ${vertical(y)}`}
        style={{ left: `${x}%`, top: `${y}%` }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <header className="thread-header">
          <span className="thread-title">
            {mode === "remark" ? "Nouvelle remarque" : "Nouvelle correction"}
            <small>{target}</small>
          </span>
          <button type="button" className="thread-icon-button" onClick={onCancel} aria-label="Annuler">
            <X />
          </button>
        </header>
        {mode === "remark" ? (
          <form
            className="thread-reply"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) onSubmit({ message: draft.trim(), decision: "À qualifier" });
            }}
          >
            <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrire une remarque…" aria-label="Remarque" />
            <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Publier">
              <ArrowUp />
            </button>
          </form>
        ) : (
          <form
            className="correction-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && draft.trim()) onSubmit({ title: title.trim(), message: draft.trim(), decision });
            }}
          >
            <label>
              Titre
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Raccourcir le titre principal" />
            </label>
            <label>
              Description
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ce qui doit être fait, précisément." rows={3} />
            </label>
            <span className="correction-form-label">Qualification</span>
            <QualificationChips value={decision} onChange={setDecision} />
            <div className="correction-form-actions">
              <button type="button" className="ghost-button" onClick={onCancel}>
                Annuler
              </button>
              <button type="submit" className="primary-button" disabled={!title.trim() || !draft.trim()}>
                Créer la correction
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

/** Blue outline on the zone under the pointer (comment tools), like Agentation. */
export function TargetHighlight({ box, drawing }: { box: TargetBox; drawing?: boolean }) {
  return (
    <div
      className={`target-highlight ${drawing ? "is-drawing" : ""}`}
      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
      aria-hidden="true"
    >
      {box.label && <span>{box.label}</span>}
    </div>
  );
}

/** Human label for a hovered element: "Bouton « Nous contacter »", "Texte « Des idées… »", "Image". */
export function describeTarget(element: Element): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  const short = text.length > 32 ? `${text.slice(0, 32)}…` : text;
  const tag = element.tagName.toLowerCase();
  if (tag === "img") {
    const alt = element.getAttribute("alt");
    return alt ? `Image « ${alt.length > 32 ? `${alt.slice(0, 32)}…` : alt} »` : "Image";
  }
  if (element.closest(".textLayer")) return short ? `Texte « ${short} »` : "Texte";
  const kind =
    tag === "button" || tag === "a"
      ? "Bouton"
      : /^h[1-6]$/.test(tag)
        ? "Titre"
        : tag === "svg"
          ? "Image"
          : tag === "nav"
            ? "Navigation"
            : tag === "p" || tag === "small" || tag === "span" || tag === "em" || tag === "b"
              ? "Texte"
              : "Groupe";
  return short && kind !== "Image" ? `${kind} « ${short} »` : kind;
}
