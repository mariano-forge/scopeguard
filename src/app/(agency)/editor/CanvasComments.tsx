"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, BadgeEuro, ClipboardCheck, Receipt, Tag, Trash2, Undo2, X } from "lucide-react";

/**
 * One request, three states:
 * - "À qualifier" → Commentaire (to clarify): written on the canvas or by hand;
 * - "Inclus"      → À traiter: qualified as part of the scope (work to do);
 * - "Hors périmètre" → Hors scope: qualified as an addition, leads to a proposal.
 * Included and out-of-scope requests only come from qualifying a comment.
 */
export type Qualification = "À qualifier" | "Inclus" | "Hors périmètre";
export type RequestKind = "comment" | "correction" | "outside";

type ThreadReply = { id: number; author: string; initials: string; message: string; time: string; createdAt?: number };

/** Current time, refreshed every minute (for "il y a 5 min"). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** "À l'instant", "il y a 5 min", "il y a 3 h", "hier", "14 oct." — older data keeps its stored text. */
export function timeLabel(item: { time: string; createdAt?: number }, now: number) {
  if (!item.createdAt) return item.time;
  const minutes = Math.floor((now - item.createdAt) / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";
  return new Date(item.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
/** Rectangle drawn on a page, in % of the page box. */
export type Area = { x: number; y: number; w: number; h: number };
export type ThreadComment = {
  id: number;
  author: string;
  initials: string;
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
export const kindLabels: Record<RequestKind, string> = { comment: "Commentaire", correction: "Demande à traiter", outside: "Demande hors scope" };
/** Short status shown on badges. */
export const statusLabels: Record<RequestKind, string> = { comment: "À clarifier", correction: "À traiter", outside: "Hors scope" };
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

export function CommentPin({ comment, active, onOpen }: { comment: ThreadComment; active: boolean; onOpen: () => void }) {
  const kind = requestKind(comment);
  return (
    <button
      type="button"
      data-pin={comment.id}
      className={`canvas-pin is-${kind} ${active ? "is-active" : ""} ${comment.initials === "AM" ? "is-agency" : "is-client"}`}
      style={{ left: `${comment.position?.x ?? 50}%`, top: `${comment.position?.y ?? 50}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${kindLabels[kind]} #${comment.id} : ${requestText(comment)}`}
      aria-expanded={active}
    >
      {kind === "correction" ? <ClipboardCheck aria-hidden="true" /> : kind === "outside" ? <BadgeEuro aria-hidden="true" /> : <span>{comment.initials}</span>}
    </button>
  );
}

/** À traiter / Hors scope switch. */
function ScopeChoice({ value, onChange }: { value: Qualification; onChange: (value: Qualification) => void }) {
  const options: { value: Qualification; label: string; hint: string }[] = [
    { value: "Inclus", label: "À traiter", hint: "Dans le scope prévu" },
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
export type Quote = { amount: number; days: number };
/** Where an out-of-scope request stands: not quoted, quoted (not sent), or sent (label says what follows). */
export type ProposalStage = { stage: "none" } | { stage: "draft" } | { stage: "sent"; label: string };

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
}) {
  const kind = requestKind(comment);
  const [draft, setDraft] = useState("");
  const [qualifying, setQualifying] = useState(Boolean(startQuoting));
  // A new request starts empty (placeholders guide it); an existing one keeps its wording.
  const [title, setTitle] = useState(comment.title ?? "");
  const [description, setDescription] = useState(comment.description ?? "");
  const now = useNow();
  const [decision, setDecision] = useState<Qualification>(kind === "outside" ? "Hors périmètre" : "Inclus");
  const [quoteOn, setQuoteOn] = useState(Boolean(quote) || Boolean(startQuoting));
  const [amount, setAmount] = useState(quote ? String(quote.amount) : "");
  const [days, setDays] = useState(quote ? String(quote.days) : "");
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

  const messages = [{ id: 0, author: comment.author, initials: comment.initials, message: comment.message, time: comment.time, createdAt: comment.createdAt }, ...(comment.replies ?? [])];
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
              quote: decision === "Hors périmètre" && quoteOn ? { amount: Number(amount), days: Number(days) || 0 } : undefined,
            });
            setQualifying(false);
          }}
        >
          <ScopeChoice value={decision} onChange={setDecision} />
          <label>
            Titre de la demande
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ce qu’il faut faire, en une phrase" />
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
                {kind === "outside" ? "Hors scope · ajout à chiffrer" : "À traiter · dans le scope"}
              </p>
              <p className="request-title">{requestText(comment)}</p>
              {comment.description && <p className="request-description">{comment.description}</p>}
              {kind === "outside" && proposal && (
                <div className="request-proposal">
                  {proposal.stage === "sent" ? (
                    <button type="button" className="secondary-button small-button" onClick={onOpenProposal}>
                      <Receipt aria-hidden="true" /> {proposal.label}
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
                        <Receipt aria-hidden="true" /> Envoyer la proposition
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

          <div className="thread-messages" ref={listRef}>
            {messages.map((message) => (
              <div key={message.id} className={`thread-message ${message.initials === "AM" ? "is-agency" : "is-client"}`}>
                <span className="thread-avatar" aria-hidden="true">
                  {message.initials}
                </span>
                <div>
                  <p className="thread-meta">
                    <b>{message.author}</b> <small>{timeLabel(message, now)}</small>
                  </p>
                  <p className="thread-text">{message.message}</p>
                </div>
              </div>
            ))}
          </div>

          {kind === "comment" && onQualify && canWrite && (
            <div className="thread-actions">
              <button type="button" className="secondary-button thread-create" onClick={() => setQualifying(true)}>
                <Tag aria-hidden="true" /> Créer une demande
              </button>
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
