"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, BadgeEuro, ChevronDown, ClipboardCheck, Pencil, Tag, Trash2, Undo2, X } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { sideOf, type Side } from "@/lib/authors";

/**
 * One request, three states:
 * - "À qualifier" → Commentaire (to clarify): written on the canvas or by hand;
 * - "Inclus"      → Inclus: part of the scope sold (work to do);
 * - "Hors périmètre" → Hors scope: qualified as an addition, leads to a proposal.
 * Included and out-of-scope requests only come from qualifying a comment.
 */
export type Qualification = "À qualifier" | "Inclus" | "Hors périmètre";
export type RequestKind = "comment" | "correction" | "outside";

type ThreadReply = { id: number; author: string; initials: string; message: string; time: string; createdAt?: number; edited?: boolean; from?: Side };

/** Current time, refreshed every 15 s (for "il y a 5 min"). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * "À l'instant", "il y a 5 min", "il y a 3 h", "hier", "14 oct.", always computed from the real time.
 * Older data has no createdAt: replies use Date.now() as id, otherwise no label (the stored text was frozen).
 */
export function timeLabel(item: { id?: number; time: string; createdAt?: number }, now: number) {
  const at = item.createdAt ?? (item.id && item.id > 1e12 ? item.id : undefined);
  if (!at) return "";
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
/** Rectangle drawn on a page, in % of the page box. */
export type Area = { x: number; y: number; w: number; h: number };
export type ThreadComment = {
  id: number;
  /** The author changed the text after posting it. */
  edited?: boolean;
  author: string;
  initials: string;
  /** Who wrote it (older comments: from their initials, see src/lib/authors.ts). */
  from?: Side;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
  /** The comment as written (first message of the thread). */
  message: string;
  /** Set when qualified: what has to be done, stated clearly. */
  title?: string;
  description?: string;
  location: string;
  decision: Qualification;
  kind?: "remark" | "request";
  sourceId?: number;
  position?: { x: number; y: number };
  area?: Area;
  replies?: ThreadReply[];
};

export const requestKind = (comment: Pick<ThreadComment, "decision">): RequestKind =>
  comment.decision === "Inclus" ? "correction" : comment.decision === "Hors périmètre" ? "outside" : "comment";
export const isQualified = (comment: Pick<ThreadComment, "decision">) => requestKind(comment) !== "comment";
export const kindLabels: Record<RequestKind, string> = { comment: "Commentaire", correction: "Demande incluse", outside: "Demande hors scope" };
/** Short status shown on badges. */
export const statusLabels: Record<RequestKind, string> = { comment: "À clarifier", correction: "Inclus", outside: "Hors scope" };
export const statusTones: Record<RequestKind, string> = { comment: "decision-pending", correction: "decision-included", outside: "decision-outside" };
/** What a request asks, in one line: its title once qualified, else the comment. */
export const requestText = (comment: Pick<ThreadComment, "title" | "message">) => comment.title ?? comment.message;

/** Hovered zone with the comment tool, in % of the page box. */
export type TargetBox = { left: number; top: number; width: number; height: number; label: string };

const side = (x: number) => (x > 58 ? "is-left" : "is-right");

/**
 * Opens the bubble where it fits in the visible canvas: on its preferred side, else the other side,
 * else centered on its pin (each step tried once, so it never loops).
 */
function useFittingSide(x: number, initial?: "is-center") {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"is-left" | "is-right" | "is-center">(initial ?? side(x));
  const tried = useRef(new Set<string>());
  useLayoutEffect(() => {
    const bubble = ref.current;
    const frame = bubble?.closest(".artboard-transform-wrapper");
    if (!bubble || !frame) return;
    tried.current.add(placement);
    const box = bubble.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    if (box.left >= bounds.left && box.right <= bounds.right) return;
    const next = (["is-right", "is-left", "is-center"] as const).find((option) => !tried.current.has(option));
    if (next) setPlacement(next);
  }, [placement]);
  return [ref, placement] as const;
}

export function CommentPin({
  comment,
  active,
  moving,
  onOpen,
  onMove,
}: {
  comment: ThreadComment;
  active: boolean;
  /** Being moved (follows the pointer). */
  moving?: boolean;
  onOpen: () => void;
  /** Double-click starts moving the pin. */
  onMove?: () => void;
}) {
  const kind = requestKind(comment);
  return (
    <button
      type="button"
      data-pin={comment.id}
      className={`canvas-pin is-${kind} ${active ? "is-active" : ""} ${moving ? "is-moving" : ""} ${sideOf(comment) === "agency" ? "is-agency" : "is-client"}`}
      style={{ left: `${comment.position?.x ?? 50}%`, top: `${comment.position?.y ?? 50}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onMove?.();
      }}
      title={onMove ? "Glisser pour déplacer" : undefined}
      aria-label={`${kindLabels[kind]} #${comment.id} : ${requestText(comment)}`}
      aria-expanded={active}
    >
      {kind === "correction" ? <ClipboardCheck aria-hidden="true" /> : kind === "outside" ? <BadgeEuro aria-hidden="true" /> : <span>{comment.initials}</span>}
    </button>
  );
}

/** One message of a discussion; the reader's own ones can be edited (Enter saves, Escape cancels) or deleted. */
function ThreadMessage({
  message,
  now,
  editable,
  onEdit,
  onDelete,
}: {
  message: ThreadReply;
  now: number;
  editable: boolean;
  onEdit?: (message: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const save = () => {
    const text = draft.trim();
    if (text && text !== message.message) onEdit?.(text);
    setEditing(false);
  };
  return (
    <div className={`thread-message ${sideOf(message) === "agency" ? "is-agency" : "is-client"}`}>
      <span className="thread-avatar" aria-hidden="true">
        {message.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="thread-meta">
          <b>{message.author}</b> {timeLabel(message, now) && <small>{timeLabel(message, now)}</small>}
          {message.edited && <small>· modifié</small>}
        </p>
        {editing ? (
          <form
            className="thread-edit"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDraft(message.message);
                  setEditing(false);
                }
              }}
              aria-label="Modifier le message"
            />
            <div className="thread-edit-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Enregistrer
              </Button>
            </div>
          </form>
        ) : (
          <p className="thread-text">{message.message}</p>
        )}
      </div>
      {editable && !editing && (onEdit || onDelete) && (
        <span className="thread-message-actions">
          {onEdit && (
            <Hint label="Modifier">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Modifier le message"
                onClick={() => {
                  setDraft(message.message);
                  setEditing(true);
                }}
              >
                <Pencil />
              </Button>
            </Hint>
          )}
          {onDelete && (
            <Hint label="Supprimer">
              <Button variant="ghost" size="icon-xs" aria-label="Supprimer le message" onClick={onDelete}>
                <Trash2 />
              </Button>
            </Hint>
          )}
        </span>
      )}
    </div>
  );
}

/** Inclus / Hors scope switch. */
export function ScopeChoice({ value, onChange }: { value: Qualification; onChange: (value: Qualification) => void }) {
  const options: { value: Qualification; label: string; hint: string }[] = [
    { value: "Inclus", label: "Inclus", hint: "Prévu au devis" },
    { value: "Hors périmètre", label: "Hors scope", hint: "Ajout à chiffrer" },
  ];
  return (
    <div className="scope-choice" role="radiogroup" aria-label="Qualification">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`scope-option is-${option.value === "Inclus" ? "correction" : "outside"} ${value === option.value ? "is-selected" : ""}`}
          onClick={() => onChange(option.value)}
        >
          <b>{option.label}</b>
          <small>{option.hint}</small>
        </button>
      ))}
    </div>
  );
}

/** Optional quote typed while qualifying an out-of-scope request (prefills the proposal, sends nothing). */
/** `counter`: the client may answer with a counter-proposal; otherwise a refusal is final. */
export type Quote = { amount: number; days: number; counter: boolean };
/** Where an out-of-scope request stands: not quoted, quoted (not sent), or sent (label says what follows). */
/** `retry`: the client refused (or the adaptation was refused): the agency can quote a new version. */
export type ProposalStage = { stage: "none" } | { stage: "draft" } | { stage: "sent"; label: string; retry?: boolean };

export type Qualified = { title: string; description: string; decision: Qualification; quote?: Quote };

/**
 * Bubble next to its pin (Figma-like). A comment shows its conversation and "Qualifier" (agency);
 * qualifying turns the same request into a correction or an out-of-scope addition, with a clear title.
 */
export function ThreadPopover({
  comment,
  readOnly,
  locked,
  proposal,
  quote,
  startQuoting,
  onReply,
  onQualify,
  onSendProposal,
  onOpenProposal,
  onDelete,
  onClose,
  me,
  onEditMessage,
  onDeleteMessage,
}: {
  comment: ThreadComment;
  readOnly: boolean;
  /** Decision locked by an accepted/refused proposal. */
  locked: boolean;
  /** Out-of-scope requests: where the proposal stands (agency only). */
  proposal?: ProposalStage;
  /** Quote already typed for this request (not sent yet). */
  quote?: Quote;
  /** Opens directly on the qualification form with the quote switched on ("Chiffrer"). */
  startQuoting?: boolean;
  onReply: (message: string) => void;
  /** Agency only: qualify a comment, change a qualification, or send it back to clarify. */
  onQualify?: (qualified: Qualified) => void;
  /** Sends the quoted proposal (the caller asks for confirmation). */
  onSendProposal?: () => void;
  /** Follows a sent proposal (adaptation, new version). */
  onOpenProposal?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  /** The side this page writes for (agency or client): its messages can be edited or deleted while the discussion is open. */
  me?: Side;
  /** Edits a message (0 = the comment itself). */
  onEditMessage?: (messageId: number, message: string) => void;
  /** Deletes a reply (the comment itself is deleted with onDelete). */
  onDeleteMessage?: (messageId: number) => void;
}) {
  const kind = requestKind(comment);
  const [draft, setDraft] = useState("");
  const [qualifying, setQualifying] = useState(Boolean(startQuoting));
  // A new request starts empty (placeholders guide it); an existing one keeps its wording.
  const [title, setTitle] = useState(comment.title ?? "");
  const [description, setDescription] = useState(comment.description ?? "");
  const now = useNow();
  // The discussion is open on a comment, folded on a qualified request (it is closed anyway).
  const [showDiscussion, setShowDiscussion] = useState(kind === "comment");
  const [decision, setDecision] = useState<Qualification>(kind === "outside" ? "Hors périmètre" : "Inclus");
  const [quoteOn, setQuoteOn] = useState(Boolean(quote) || Boolean(startQuoting));
  const [amount, setAmount] = useState(quote ? String(quote.amount) : "");
  const [days, setDays] = useState(quote ? String(quote.days) : "");
  const [counter, setCounter] = useState(quote?.counter ?? false);
  const quoteReady = !quoteOn || decision !== "Hors périmètre" || Number(amount) > 0;
  const listRef = useRef<HTMLDivElement>(null);
  // A comment added by hand has no spot: its bubble opens at the top of the page, centered.
  const x = comment.position?.x ?? 50;
  const y = comment.position?.y ?? 3;
  const [bubbleRef, placement] = useFittingSide(x, comment.position ? undefined : "is-center");
  const canWrite = !readOnly && !locked;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comment.replies?.length]);

  const messages = [
    { id: 0, author: comment.author, initials: comment.initials, from: comment.from, message: comment.message, time: comment.time, createdAt: comment.createdAt, edited: comment.edited },
    ...(comment.replies ?? []),
  ];
  return (
    <div
      ref={bubbleRef}
      className={`thread is-${kind} ${qualifying ? "is-qualifying" : ""} ${placement}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      role="dialog"
      aria-label={`${kindLabels[kind]} #${comment.id}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="thread-header">
        <span className="thread-title">
          {kind === "comment" ? "Commentaire" : "Demande"} n°{comment.id}
        </span>
        <span className="thread-header-actions">
          {kind === "comment" && onQualify && canWrite && !qualifying && (
            <Hint label="Créer une demande (incluse ou hors scope)">
              <Button variant="outline" size="icon-sm" className="thread-create" onClick={() => setQualifying(true)} aria-label="Créer une demande">
                <Tag />
              </Button>
            </Hint>
          )}
          {onDelete && (
            <Hint label="Supprimer">
              <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Supprimer">
                <Trash2 />
              </Button>
            </Hint>
          )}
          <Hint label="Fermer">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <X />
            </Button>
          </Hint>
        </span>
      </header>

      {qualifying ? (
        <form
          className="qualify-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || !quoteReady) return;
            onQualify?.({
              title: title.trim(),
              description: description.trim(),
              decision,
              quote: decision === "Hors périmètre" && quoteOn ? { amount: Number(amount), days: Number(days) || 0, counter } : undefined,
            });
            setQualifying(false);
          }}
        >
          <div className="scope-field">
            <span className="scope-field-label" id={`scope-${comment.id}`}>
              Qualifier la demande
            </span>
            <ScopeChoice value={decision} onChange={setDecision} />
          </div>
          <label>
            Titre de la demande
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. : Ajouter une section témoignages" />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Précisions utiles : où, comment, contraintes… (facultatif)" />
          </label>
          {decision === "Hors périmètre" && (
            <div className="quote-block">
              <label className="quote-toggle">
                <span>
                  <b>Chiffrer maintenant</b>
                  <small>Pré-remplit la proposition, rien n’est envoyé au client.</small>
                </span>
                <input type="checkbox" role="switch" checked={quoteOn} onChange={(event) => setQuoteOn(event.target.checked)} />
              </label>
              {quoteOn && (
                <div className="quote-fields">
                  <label>
                    Montant HT (€)
                    <input type="number" min="0" step="10" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="850" />
                  </label>
                  <label>
                    Délai (jours)
                    <input type="number" min="0" step="1" value={days} onChange={(event) => setDays(event.target.value)} placeholder="3" />
                  </label>
                  <label className="quote-check">
                    <input type="checkbox" checked={counter} onChange={(event) => setCounter(event.target.checked)} />
                    <span>Le client peut faire une contre-proposition</span>
                  </label>
                </div>
              )}
            </div>
          )}
          <div className="qualify-form-actions">
            <button type="button" className="ghost-button" onClick={() => setQualifying(false)}>
              Annuler
            </button>
            <button type="submit" className="primary-button" disabled={!title.trim() || !quoteReady}>
              {kind === "comment" ? "Créer la demande" : "Enregistrer"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {kind !== "comment" && (
            <div className="request-body">
              <p className={`request-kind is-${kind}`}>
                <i className={`kind-square is-${kind}`} aria-hidden="true" />
                {kind === "outside" ? "Hors scope · ajout à chiffrer" : "Inclus · prévu au devis"}
              </p>
              <p className="request-title">{requestText(comment)}</p>
              {comment.description && <p className="request-description">{comment.description}</p>}
              {kind === "outside" && proposal && (
                <div className="request-proposal">
                  {proposal.stage === "sent" ? (
                    <button type="button" className="secondary-button small-button" onClick={onOpenProposal}>
                      {proposal.label}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        disabled={!canWrite}
                        onClick={() => {
                          setQuoteOn(true);
                          setQualifying(true);
                        }}
                      >
                        {proposal.stage === "draft" ? "Modifier" : "Chiffrer"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        disabled={proposal.stage !== "draft" || readOnly}
                        title={proposal.stage === "draft" ? undefined : "Chiffrez d’abord la demande"}
                        onClick={onSendProposal}
                      >
                        Envoyer la proposition
                      </button>
                    </>
                  )}
                </div>
              )}
              {onQualify && canWrite && (
                <div className="request-actions">
                  {/* Out-of-scope requests are edited from their "Chiffrer / Modifier" button. */}
                  {kind !== "outside" && (
                    <button type="button" className="thread-link" onClick={() => setQualifying(true)}>
                      <Tag aria-hidden="true" /> Modifier
                    </button>
                  )}
                  <button
                    type="button"
                    className="thread-link"
                    onClick={() => onQualify({ title: comment.title ?? "", description: comment.description ?? "", decision: "À qualifier" })}
                  >
                    <Undo2 aria-hidden="true" /> Remettre à clarifier
                  </button>
                </div>
              )}
            </div>
          )}

          {kind !== "comment" && (
            <button type="button" className="discussion-toggle" aria-expanded={showDiscussion} onClick={() => setShowDiscussion((open) => !open)}>
              Discussion · {messages.length} message{messages.length > 1 ? "s" : ""}
              <ChevronDown aria-hidden="true" className={showDiscussion ? "is-open" : ""} />
            </button>
          )}
          {showDiscussion && (
          <div className="thread-messages" ref={listRef}>
            {messages.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                now={now}
                // Own messages, while the discussion is open.
                editable={Boolean(me) && sideOf(message) === me && kind === "comment" && canWrite}
                onEdit={onEditMessage ? (text) => onEditMessage(message.id, text) : undefined}
                onDelete={message.id === 0 ? onDelete : onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
              />
            ))}
          </div>
          )}


          {kind !== "comment" ? (
            <p className="thread-locked">
              Demande qualifiée : la discussion est close.{onQualify && canWrite ? " Remettez-la à clarifier pour la rouvrir." : ""}
            </p>
          ) : canWrite ? (
            <form
              className="thread-reply"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                onReply(draft.trim());
                setDraft("");
              }}
            >
              <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Répondre, demander une précision…" aria-label="Répondre" />
              <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Envoyer la réponse">
                <ArrowUp />
              </button>
            </form>
          ) : (
            <p className="thread-locked">{readOnly ? "Version en lecture seule." : "Décision verrouillée par la proposition."}</p>
          )}
        </>
      )}
    </div>
  );
}

export type ComposerResult = { message: string };

/** Where a new comment is written, right where the canvas was clicked (or the area drawn). */
export function Composer({
  x,
  y,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [bubbleRef, placement] = useFittingSide(x);
  return (
    <>
      <span className="composer-pin" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
      <div
        ref={bubbleRef}
        className={`thread composer ${placement}`}
        style={{ left: `${x}%`, top: `${y}%` }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <header className="thread-header">
          <span className="thread-title">
            Nouveau commentaire
          </span>
          <button type="button" className="thread-icon-button" onClick={onCancel} aria-label="Annuler">
            <X />
          </button>
        </header>
        <form
          className="thread-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onSubmit({ message: draft.trim() });
          }}
        >
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrire un commentaire…" aria-label="Commentaire" />
          <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Publier">
            <ArrowUp />
          </button>
        </form>
      </div>
    </>
  );
}

/** Blue outline on the zone under the pointer (comment tool), like Agentation. */
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
