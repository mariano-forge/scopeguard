"use client";

import { useState } from "react";
import { ChevronUp, Eye, MessageSquare, Plus, Share2 } from "lucide-react";
import type { Qualification, ThreadView } from "./CanvasComments";
import { ResizeHandle } from "./ResizeHandle";
import { isAgencyDraft, itemLabel, requestKind, requestText, useNow, type RequestKind, type ThreadComment } from "./CanvasComments";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { outsideFilters, outsideStatusView, type OutsideStatus } from "@/lib/outsideStatus";

/** What a card made in Kora says of its source (pinned on the deliverable, or entered without one). */

/** « draft »: the agency's pins with no status yet; « closed »: discussions closed (archived). */
export type InspectorTab = RequestKind | "draft" | "closed";

/** The tab a request is listed in; drafts only where the panel shows them (the agency's). */
export const inspectorTabOf = (comment: ThreadComment, drafts = true): InspectorTab =>
  comment.closed ? "closed" : drafts && isAgencyDraft(comment) ? "draft" : requestKind(comment);

type TabOption = { kind: InspectorTab; label: string; emptyTitle: string; empty: string };
const requestTabs: TabOption[] = [
  { kind: "comment", label: "À clarifier", emptyTitle: "Rien à clarifier", empty: "Cliquez sur le livrable pour commenter, ou ajoutez une demande reçue ailleurs avec « + Demande »." },
  { kind: "correction", label: "Inclus", emptyTitle: "Aucune demande incluse", empty: "Les demandes prévues au devis s’affichent ici, une fois qualifiées « Inclus »." },
  { kind: "outside", label: "Hors scope", emptyTitle: "Aucun ajout hors scope", empty: "Les ajouts à chiffrer s’affichent ici, une fois qualifiés « Hors scope »." },
];
const commentTabs: TabOption[] = [
  { kind: "draft", label: "Mes brouillons", emptyTitle: "Aucun brouillon", empty: "Vos commentaires restent ici, internes, tant que vous ne les avez pas qualifiés." },
  { kind: "closed", label: "Clôturées", emptyTitle: "Aucune discussion clôturée", empty: "Une discussion clôturée s’affiche ici, en lecture seule ; rouvrez-la pour y répondre." },
];
// The client's word for it is the agency's (« Clôturer la discussion », « Discussions · Clôturées »).
const closedTab: TabOption = { kind: "closed", label: "Clôturées", emptyTitle: "Aucune discussion clôturée", empty: "Les discussions clôturées par l’organisation s’affichent ici, en lecture seule." };

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

/** A status, small: a colored dot and its words. */
// The card's pieces live in requestCard.tsx (also the board's and the staging site panel's, kept light there).
import { RequestCardLines, StatusPill, type CardAmount } from "./requestCard";
export { RequestCardLines, StatusPill, type CardAmount };

/**
 * Requests of a version as cards, by status (À clarifier · Inclus · Hors scope). The agency's panel adds
 * a second view, « Discussions », with its drafts and the discussions it closed; the client's lists the
 * closed ones in their own tab. Used by the agency inspector, the client page and the staging-site panel.
 */
export function RequestPanel({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalAmount,
  unread,
  adding,
  onAddingChange,
  onAddComment,
  emptyHint,
  drafts = false,
  outsideStatus,
  reader = "client",
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Shows that request on the canvas. */
  /** Opens a request's bubble, on the tab clicked on its card (its messages, its source). */
  onFocus: (commentId: number, view?: ThreadView) => void;
  /** Out-of-scope requests: the amount of their proposal (« 1 000 € HT ») and whether it is offered; none before one is prepared. */
  proposalAmount?: (comment: ThreadComment) => CardAmount | null;
  /** Messages of the other side the reader hasn't opened yet (0 or false: none). */
  unread?: (comment: ThreadComment) => number | boolean;
  /** The manual comment form is open (opened from the panel header's "+"). */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Adds a comment by hand (not tied to a spot of the canvas); absent when read-only. */
  onAddComment?: (message: string) => void;
  /** How to add a comment where the panel is used, said when there is none yet (the canvas's by default). */
  emptyHint?: string;
  /** The agency's panel: « Discussions » (drafts, closed discussions) beside « Demandes ». */
  drafts?: boolean;
  /** Where each out-of-scope request stands (src/lib/outsideStatus.ts): its tag and the tab's filter. */
  outsideStatus?: (comment: ThreadComment) => OutsideStatus;
  /** Whose words the statuses use. */
  reader?: "agency" | "client";
}) {
  const [draft, setDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<OutsideStatus | "all">("all");
  const now = useNow();
  const tabOf = (comment: ThreadComment) => inspectorTabOf(comment, drafts);
  const count = (kind: InspectorTab) => comments.filter((comment) => tabOf(comment) === kind).length;
  const unreadCount = (comment: ThreadComment) => Number(unread?.(comment) ?? 0);
  const hasUnread = (kind: InspectorTab) => comments.some((comment) => tabOf(comment) === kind && unreadCount(comment) > 0);
  const view: "requests" | "comments" = drafts && (tab === "draft" || tab === "closed") ? "comments" : "requests";
  const shownTabs = view === "comments" ? commentTabs : drafts || count("closed") === 0 ? requestTabs : [...requestTabs, closedTab];
  const current = shownTabs.find((option) => option.kind === tab) ?? shownTabs[0];
  const inTab = comments.filter((comment) => tabOf(comment) === current.kind);
  const statusOf = (comment: ThreadComment) => (outsideStatus ? outsideStatusView(outsideStatus(comment), reader) : null);
  // The client sees one status where the agency sees two (not quoted, quoted): counted by their words.
  const statusCount = (status: OutsideStatus) => inTab.filter((comment) => statusOf(comment)?.label === outsideStatusView(status, reader).label).length;
  const filtering = current.kind === "outside" && Boolean(outsideStatus) && statusFilter !== "all";
  const list = inTab
    .filter((comment) => !filtering || statusOf(comment)?.label === outsideStatusView(statusFilter as OutsideStatus, reader).label)
    // A video's comments in the order of the film; anything else, the newest first.
    .sort((left, right) => (inTab.every((comment) => comment.timecode !== undefined) ? left.timecode! - right.timecode! : right.id - left.id));
  const views = [
    { key: "requests", label: "Demandes", options: requestTabs },
    { key: "comments", label: "Discussions", options: commentTabs },
  ] as const;

  return (
    <>
      {drafts && (
        <Tabs value={view} onValueChange={(next) => onTab((next === "comments" ? commentTabs : requestTabs)[0].kind)} className="panel-views">
          <TabsList aria-label="Vue du panneau" className="w-full">
            {views.map((option) => (
              <TabsTrigger key={option.key} value={option.key}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="inspector-tabs" role="tablist" aria-label="Demandes">
        {shownTabs.map((option) => (
          <button key={option.kind} role="tab" aria-selected={current.kind === option.kind} className={current.kind === option.kind ? "is-active" : ""} onClick={() => onTab(option.kind)}>
            {option.label}{" "}
            <span className="tab-count">
              {count(option.kind)}
              {hasUnread(option.kind) && <i className="unread-dot" aria-label="Message non lu" />}
            </span>
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
            onTab(drafts ? "draft" : "comment");
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
        {current.kind === "outside" && outsideStatus && inTab.length > 0 && (
          <div className="status-filter">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OutsideStatus | "all")}>
              <SelectTrigger size="sm" className="w-full" aria-label="Filtrer par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="status-filter-menu">
                <SelectItem value="all">Tous les statuts · {inTab.length}</SelectItem>
                {outsideFilters(reader).map((status) => (
                  <SelectItem key={status} value={status}>
                    {outsideStatusView(status, reader).label} · {statusCount(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {list.length === 0 ? (
          <div className="inspector-empty-state">
            <span className="empty-state-mark" aria-hidden="true">
              <MessageSquare />
            </span>
            <b>{filtering ? "Aucune demande avec ce statut" : current.emptyTitle}</b>
            <p>{filtering ? "Choisissez un autre statut, ou « Tous les statuts »." : current.kind === "comment" && emptyHint ? emptyHint : current.empty}</p>
          </div>
        ) : (
          <ul>
            {list.map((comment) => {
              const kind = requestKind(comment);
              const status = kind === "outside" ? statusOf(comment) : null;
              // Out of scope: its amount, the one figure to sort by (feedback of 26 October 2026).
              const amount = kind === "outside" && !comment.closed ? proposalAmount?.(comment) : null;
              const fresh = unreadCount(comment);
              // One card for every tab, no button (feedback of 26 October 2026): its status (and amount), its title,
              // who and when (the moment of a video), then its messages and its source. Every gesture is in its bubble.
              return (
                <li key={comment.id} className={`inspector-row ${comment.id === selectedId ? "is-selected" : ""} ${comment.closed ? "is-closed" : ""}`}>
                  <button
                    className={`thread-row ${comment.id === selectedId ? "is-selected" : ""}`}
                    aria-current={comment.id === selectedId ? "true" : undefined}
                    aria-label={`${itemLabel(comment)} #${comment.id}`}
                    // Where it came from, read after its name (the name stays the card's own).
                    aria-describedby={comment.source ? `source-${comment.id}` : undefined}
                    // Its messages open on « Discussion », its source on « Source »; anywhere else, on its detail.
                    onClick={(event) => {
                      const target = event.target as Element;
                      onFocus(comment.id, target.closest(".thread-row-replies") ? "discussion" : target.closest(".thread-row-source") ? "source" : undefined);
                    }}
                  >
                    <RequestCardLines
                      comment={comment}
                      now={now}
                      head={comment.closed ? <StatusPill label="Clôturée" tone="waiting" /> : status?.label ? <StatusPill label={status.label} tone={status.tone} /> : null}
                      amount={amount}
                      fresh={fresh}
                    />
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
 * Header: "Demandes", add a comment, client preview, share. Copy / export live in the canvas toolbar.
 */
export function EditorInspector({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalAmount,
  onAddRequest,
  onShare,
  onPreview,
  scopeAction,
  width,
  onResize,
  notifications,
  unread,
  outsideStatus,
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Opens a request's bubble, on the tab clicked on its card (its messages, its source). */
  onFocus: (commentId: number, view?: ThreadView) => void;
  proposalAmount: (comment: ThreadComment) => CardAmount | null;
  /** Opens the "new request" form, already qualified (no comment first). */
  onAddRequest?: (decision: Qualification) => void;
  onShare: () => void;
  /** Opens the page the client sees, in a new tab. */
  onPreview: () => void;
  /** What was agreed for the project (ProjectScope.tsx), at the head of the panel. */
  scopeAction?: React.ReactNode;
  width: number;
  onResize: (width: number) => void;
  /** The bell, at the head of the panel. */
  notifications?: React.ReactNode;
  unread?: (comment: ThreadComment) => number;
  outsideStatus?: (comment: ThreadComment) => OutsideStatus;
}) {
  // Phones: the panel is a sheet at the bottom of the screen, opened by its handle (CSS, max-width 680px).
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <aside className="inspector editor-inspector" aria-label="Demandes" data-sheet-open={sheetOpen || undefined}>
      <button
        type="button"
        className="inspector-sheet-toggle"
        aria-label={`${sheetOpen ? "Replier" : "Ouvrir"} le panneau des demandes (${comments.length})`}
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen((open) => !open)}
      >
        <span>
          Demandes <b>{comments.length}</b>
        </span>
        <ChevronUp aria-hidden="true" />
      </button>
      <ResizeHandle edge="left" width={width} min={320} max={560} defaultWidth={384} label="Largeur du panneau des demandes" onResize={onResize} />
      <header className="requests-header">
        {notifications}
        <div className="requests-actions">
          {scopeAction}
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
          {onAddRequest && (
            <Hint label="Une demande reçue ailleurs (e-mail, appel, réunion…) ou portant sur tout le livrable">
              {/* « + Demande », as the empty list names it: the panel's header keeps room for its four actions. */}
              <Button className="requests-add" aria-label="Ajouter une demande" onClick={() => onAddRequest(tab === "outside" ? "Hors périmètre" : tab === "correction" ? "Inclus" : "À qualifier")}>
                <Plus /> Demande
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
        proposalAmount={proposalAmount}
        unread={unread}
        drafts
        outsideStatus={outsideStatus}
        reader="agency"
        adding={false}
        onAddingChange={() => undefined}
      />
    </aside>
  );
}
