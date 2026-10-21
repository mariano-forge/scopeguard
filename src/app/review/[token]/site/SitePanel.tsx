"use client";

// Kora's frame on the agency's staging site (see page.tsx), in two shapes the toolbar gives it
// (public/kora-toolbar.js): a bubble next to a pin or a click, where a comment is written or its thread
// read, as on Kora's canvas; or a list on the right, of the comments on the page the visitor is on. The
// follow-up of the requests (statuses, quotes, validation) is done in Kora. The frame verifies who is
// there, holds the comments' text and writes them through the action routes; the site only learns where
// to draw the pins.
// - A client verifies their address by code (AccessGate) and writes through src/lib/reviewActions.ts.
// - An agency member is recognised by a Kora window, where their Kora session is (« Je suis de l'agence »,
//   src/lib/siteAgency.ts), never by a code: codes are for clients. They comment, reply and qualify through
//   src/lib/agencyActions.ts; quotes are sent from Kora.
// Every message is checked: from the site's origin and the window that framed the panel, or from the
// review tab the panel opened.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, MapPin, MessageCirclePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { itemLabel, requestKind, requestText, ThreadPopover, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { sideOf } from "@/lib/authors";
import { siteAgencyAction } from "@/lib/agencyActions";
import { reviewAction } from "@/lib/reviewActions";
import { type HandoffMessage, type PanelMessage, type SiteAnchor, type SitePin, type TicketMessage, type ToolbarMessage } from "@/lib/siteReview";
import { loadSharedState, subscribeSharedState } from "@/lib/stateSync";
import { uploadSiteCapture } from "@/lib/upload";
import { AccessGate, ProfileGate } from "../AccessGate";

type Viewer = {
  mode: "client" | "preview" | "agency" | "none";
  verifiedEmail: string | null;
  invitation: { id: string | null; masked: string } | null;
  name: string | null;
  deliverable: string;
  agency: { name: string; href: string } | null;
  role: "decider" | "contributor" | null;
};

/** A comment as the frame shows it: Kora's thread comment, placed on the site. */
type SiteComment = ThreadComment & { site?: SiteAnchor };

type VersionView = {
  comments: SiteComment[];
  deliverableId: number | null;
  /** Sent quotes waiting for the client's decision (not answered, no counter-proposal pending). */
  pendingQuotes: number;
  /** The version is not validated yet. */
  toValidate: boolean;
  /** Validated or replaced: read only. */
  closed: boolean;
};

/** The comments placed on the site, and what waits for the client. */
function versionOf(serialized: string | null): VersionView {
  try {
    const state = JSON.parse(serialized ?? "null") as {
      comments?: SiteComment[];
      deliverables?: { id: number; reviewStatus?: string; status?: string; locked?: boolean }[];
      proposalStates?: Record<string, unknown>;
      proposalDecisions?: Record<string, unknown>;
      adaptationRequests?: Record<string, unknown>;
    } | null;
    const record = state?.deliverables?.[0];
    const pendingQuotes = Object.entries(state?.proposalStates ?? {}).filter(
      ([key, value]) => value === "sent" && !["accepted", "refused"].includes(String(state?.proposalDecisions?.[key])) && !state?.adaptationRequests?.[key],
    ).length;
    const approved = record?.reviewStatus === "approved" || record?.status === "Approuvée";
    return {
      // An old « À traiter » reads « À clarifier », as everywhere in Kora.
      comments: (state?.comments ?? [])
        .filter((comment) => comment.site)
        .map((comment) => ({ ...comment, decision: comment.decision === "Inclus" || comment.decision === "Hors périmètre" ? comment.decision : "À qualifier" })),
      deliverableId: record?.id ?? null,
      pendingQuotes,
      toValidate: Boolean(record) && !approved,
      closed: approved || Boolean(record?.locked) || record?.status === "Remplacée",
    };
  } catch {
    return { comments: [], deliverableId: null, pendingQuotes: 0, toValidate: false, closed: false };
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 && !word.endsWith("s") ? "s" : ""}`;

export function SitePanel({ token, parent }: { token: string; parent: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  const [{ comments, deliverableId, pendingQuotes, toValidate, closed }, setVersion] = useState(() => versionOf(null));
  /** The page the visitor is on, as the toolbar reports it. */
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  /** The comment being written: where it was placed, and the capture of the window (undefined while it is made, null without). */
  const [draft, setDraft] = useState<{ pick: number; anchor: SiteAnchor; label: string; capture?: Blob | null } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  /** The comment whose thread is open, in the bubble at its pin. */
  const [openId, setOpenId] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  /** The frame is the list on the right (the toolbar says so): a comment opens in it, under its header. */
  const [docked, setDocked] = useState(false);
  /** The review tab opened from the panel, and the ticket it will be handed (src/lib/siteHandoff.ts). */
  const reviewTab = useRef<{ tab: Window; ticket: Promise<string | null> } | null>(null);
  const [agencyError, setAgencyError] = useState("");
  /** The « Je suis de l'agence » window: the only one whose ticket the panel takes. */
  const agencyWindow = useRef<Window | null>(null);
  const bubbleRef = useRef<HTMLElement>(null);
  const client = viewer?.mode === "client" && Boolean(viewer.name);
  const agency = viewer?.mode === "agency";
  const me = agency ? "agency" : "client";

  const tellSite = (data: PanelMessage) => window.parent.postMessage(data, parent);

  // Signed in, the bar opens on its own and the list only when asked; otherwise Kora opens on this door.
  const signedIn = client || agency;
  useEffect(() => {
    window.parent.postMessage({ type: "kora:signed", in: signedIn } satisfies PanelMessage, parent);
  }, [signedIn, parent]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/review/${encodeURIComponent(token)}/access`, { cache: "no-store" })
      .then(async (response) => !cancelled && response.ok && setViewer(await response.json()))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, accessCheck]);

  useEffect(() => {
    if (!client && !agency) return;
    let cancelled = false;
    void loadSharedState(token).then((serialized) => !cancelled && setVersion(versionOf(serialized)));
    const unsubscribe = subscribeSharedState((serialized) => setVersion(versionOf(serialized)));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, agency, token]);

  useEffect(() => {
    function receive(event: MessageEvent<ToolbarMessage>) {
      if (event.origin !== parent || event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      const data = event.data;
      if (data.type === "kora:page" && typeof data.url === "string") setPageUrl(data.url);
      else if (data.type === "kora:pick" && data.anchor) {
        setOpenId(null);
        setMessage("");
        setDraft({ pick: Number(data.pick), anchor: data.anchor, label: String(data.label ?? "").slice(0, 120) });
      } else if (data.type === "kora:capture") {
        // A JPEG or PNG of a few megabytes at most (the server checks it again, src/lib/siteCapture.ts).
        const blob = data.blob instanceof Blob && /^image\/(jpeg|png)$/.test(data.blob.type) && data.blob.size <= 3 * 1024 * 1024 ? data.blob : null;
        setDraft((current) => (current && current.pick === Number(data.pick) ? { ...current, capture: blob } : current));
      } else if (data.type === "kora:open" && typeof data.id === "number") {
        setDraft(null);
        setOpenId(data.id);
      } else if (data.type === "kora:dismiss") {
        setDraft(null);
        setOpenId(null);
      } else if (data.type === "kora:docked") setDocked(data.on === true);
      else if (data.type === "kora:missing" && Array.isArray(data.ids)) setMissing(data.ids.filter((id): id is number => typeof id === "number"));
    }
    window.addEventListener("message", receive);
    // Listening from now on: the toolbar answers with the page the visitor is on.
    window.parent.postMessage({ type: "kora:ready" } satisfies PanelMessage, parent);
    return () => window.removeEventListener("message", receive);
  }, [parent]);

  // The ticket of the Kora window, exchanged for the panel's agency session.
  useEffect(() => {
    async function receive(event: MessageEvent<TicketMessage>) {
      if (event.origin !== window.location.origin || !agencyWindow.current || event.source !== agencyWindow.current) return;
      if (event.data?.type !== "kora:agency-ticket" || typeof event.data.ticket !== "string") return;
      // The window waits for the panel to have the ticket before it goes (AgencyHandoff).
      agencyWindow.current.close();
      agencyWindow.current = null;
      const response = await fetch(`/api/review/${encodeURIComponent(token)}/site/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: event.data.ticket }),
      }).catch(() => null);
      if (!response?.ok) return setAgencyError("La reconnaissance n’a pas abouti. Réessayez.");
      setViewer(null);
      setAccessCheck((count) => count + 1);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [token]);

  // The review tab is ready: it gets its ticket, from this window only.
  useEffect(() => {
    async function receive(event: MessageEvent<HandoffMessage>) {
      const opened = reviewTab.current;
      if (event.origin !== window.location.origin || !opened || event.source !== opened.tab || event.data?.type !== "kora:handoff-ready") return;
      reviewTab.current = null;
      const ticket = await opened.ticket;
      if (ticket) opened.tab.postMessage({ type: "kora:handoff-ticket", ticket } satisfies HandoffMessage, window.location.origin);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const onPage = comments.filter((comment) => comment.site?.url === pageUrl);
  const opened = comments.find((comment) => comment.id === openId);
  const inBubble = Boolean((client || agency) && (draft || opened));

  // The site draws the pins of its page as Kora does: place, status, initials, label; never the text.
  // A closed discussion leaves the site, as in Kora.
  const pins: SitePin[] = onPage.filter((comment) => !comment.closed).map((comment) => ({
    id: comment.id,
    selector: comment.site!.selector,
    x: comment.site!.x,
    y: comment.site!.y,
    kind: requestKind(comment),
    initials: comment.initials ?? "",
    agency: sideOf(comment) === "agency",
    label: itemLabel(comment),
  }));
  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    window.parent.postMessage({ type: "kora:pins", pins: JSON.parse(pinsKey) as SitePin[] } satisfies PanelMessage, parent);
  }, [pinsKey, parent]);

  // The toolbar shapes the frame: a bubble while a comment is written or read, the list otherwise. Told
  // again for each comment, so that the bubble goes to the pin or the click it now belongs to.
  useEffect(() => {
    window.parent.postMessage({ type: "kora:bubble", open: inBubble } satisfies PanelMessage, parent);
  }, [inBubble, openId, draft?.pick, parent]);
  // The bubble is as tall as what it holds (a thread grows with its replies, the qualifying form…),
  // measured on its content: the frame itself is as tall as the bubble was.
  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!inBubble || !bubble) return;
    const tell = () => {
      const height = Array.from(bubble.children).reduce((total, child) => total + child.getBoundingClientRect().height, 0);
      window.parent.postMessage({ type: "kora:size", height: Math.ceil(height) } satisfies PanelMessage, parent);
    };
    const watch = new ResizeObserver(tell);
    for (const child of Array.from(bubble.children)) watch.observe(child);
    tell();
    return () => watch.disconnect();
  }, [inBubble, docked, openId, draft?.pick, draft?.capture, missing, parent]);

  function openAgencyWindow() {
    setAgencyError("");
    agencyWindow.current = window.open(`/review/${encodeURIComponent(token)}/site/agence`, "kora-agence", "popup,width=460,height=600");
  }

  /** Quotes and the validation are decided on the review page, opened in a tab without a second code. */
  function openReview() {
    const tab = window.open(`/review/${encodeURIComponent(token)}/site/ouvrir`, "_blank");
    if (!tab) return;
    const ticket = fetch(`/api/review/${encodeURIComponent(token)}/site/handoff`, { method: "POST" })
      .then(async (response) => (response.ok ? ((await response.json()) as { ticket?: string }).ticket ?? null : null))
      .catch(() => null);
    reviewTab.current = { tab, ticket };
  }

  if (!viewer) return <main className="p-6 text-sm text-[var(--graphite)]">Chargement…</main>;
  if (viewer.mode === "none" || viewer.mode === "preview")
    return (
      <div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 text-sm">
          {agencyError && <span role="alert" className="text-[var(--status-high-text)]">{agencyError}</span>}
          <Button type="button" variant="link" size="sm" onClick={openAgencyWindow}>
            Je suis de l’agence
          </Button>
        </div>
        <AccessGate
          token={token}
          deliverable={viewer.deliverable}
          invitation={viewer.invitation}
          verifiedEmail={viewer.verifiedEmail}
          site
          onVerified={() => {
            setViewer(null);
            setAccessCheck((count) => count + 1);
          }}
        />
      </div>
    );
  if (viewer.mode === "client" && !viewer.name && viewer.verifiedEmail)
    return <ProfileGate token={token} deliverable={viewer.deliverable} email={viewer.verifiedEmail} onSaved={(name) => setViewer({ ...viewer, name })} />;
  if (!client && !agency) return <main className="p-6 text-sm text-[var(--graphite)]">Réservé aux personnes invitées sur cette revue.</main>;

  // ——— Gestures, through the route of the side the frame writes for ———

  const act = (path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: Record<string, unknown>) =>
    agency ? siteAgencyAction(path, method, body) : reviewAction(token, path, method, body);

  function closeDraft() {
    setDraft(null);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !message.trim() || sending) return;
    setSending(true);
    // The capture goes first: the comment names it (one without if it could not be sent).
    const capture = draft.capture ? await uploadSiteCapture(token, draft.capture) : null;
    const body = { message: message.trim(), location: draft.anchor.url, site: { ...draft.anchor, ...(capture ? { capture } : {}) } };
    // The agency's comment stays internal until qualified, as a pin in Kora.
    const created = await act("comments", "POST", agency ? { ...body, deliverableId } : body);
    setSending(false);
    if (!created) return;
    closeDraft();
    setMessage("");
    if (typeof created.id === "number") setOpenId(created.id);
  }

  // ——— A comment written or read: in a bubble next to its pin or the click, or in the open list ———

  const commentView = (
    <>
        {draft && closed ? (
          // The version is validated or replaced: nothing more is written on it.
          <div className="bubble-closed" role="status">
            <p>Cette version est close : plus aucun commentaire n’y est possible.</p>
            <Button type="button" variant="outline" size="sm" onClick={closeDraft}>
              Fermer
            </Button>
          </div>
        ) : draft ? (
          <form className="bubble-composer" onSubmit={send}>
            <div className="bubble-head">
              <span className="bubble-target" title={draft.anchor.selector}>
                <MapPin aria-hidden="true" /> <span className="truncate">{draft.label || draft.anchor.selector}</span>
              </span>
              <Button type="button" variant="ghost" size="icon" className="bubble-close" aria-label="Annuler le commentaire" onClick={closeDraft}>
                <X />
              </Button>
            </div>
            <Textarea
              autoFocus
              rows={3}
              maxLength={5000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-label={agency ? "Votre commentaire (interne jusqu’à sa qualification)" : "Votre commentaire"}
              placeholder={agency ? "Un commentaire pour l’équipe…" : "Ce que vous souhaitez changer ici…"}
            />
            <div className="bubble-foot">
              {/* The page's capture goes with the comment: sending waits for it, a spinner says so. */}
              <Button type="submit" size="sm" disabled={!message.trim() || draft.capture === undefined || sending} aria-busy={draft.capture === undefined || sending}>
                {(draft.capture === undefined || sending) && <Loader2 aria-hidden="true" className="animate-spin" />} Envoyer
              </Button>
            </div>
          </form>
        ) : opened ? (
          <>
            {missing.includes(opened.id) && (
              <p className="bubble-missing">
                <MapPin aria-hidden="true" /> Élément introuvable sur la page : la capture montre ce qui était visé.
              </p>
            )}
            <ThreadPopover
              key={`${opened.id}-${opened.decision}`}
              comment={opened}
              readOnly={closed}
              locked={false}
              me={me}
              onClose={() => setOpenId(null)}
              onReply={(text) => void act(`comments/${opened.id}/replies`, "POST", { message: text })}
              onEditMessage={(messageId, text) => void act(messageId === 0 ? `comments/${opened.id}` : `comments/${opened.id}/replies/${messageId}`, "PATCH", { message: text })}
              onDeleteMessage={(messageId) => void act(`comments/${opened.id}/replies/${messageId}`, "DELETE")}
              onDelete={
                !closed && sideOf(opened) === me && requestKind(opened) === "comment" && !opened.title?.trim() && !opened.closed
                  ? () => {
                      setOpenId(null);
                      void act(`comments/${opened.id}`, "DELETE");
                    }
                  : undefined
              }
              // The agency qualifies here, a draft quote included (nothing is sent to the client); it sends quotes from Kora.
              onQualify={
                agency
                  ? ({ decision, title, description, quote }) =>
                      void siteAgencyAction(`comments/${opened.id}/qualification`, "PUT", { decision, title, description, ...(quote ? { quote } : {}) })
                  : undefined
              }
            />
          </>
        ) : null}
    </>
  );

  if (inBubble && !docked)
    return (
      <main ref={bubbleRef} className="site-bubble" aria-label={draft ? "Nouveau commentaire" : "Commentaire"}>
        {commentView}
      </main>
    );

  // ——— The list of the page's comments ———

  const waiting = client && pendingQuotes > 0 ? `${plural(pendingQuotes, "devis")} ${pendingQuotes > 1 ? "attendent" : "attend"} votre décision.` : null;
  // Something waits for the decider (a quote, the validation): the way to Kora is the one to take now.
  const due = Boolean(waiting) || (client && toValidate && viewer.role === "decider");
  return (
    <main className="inspector site-panel" aria-label="Commentaires">
      <header className="site-panel-header">
        <div className="min-w-0">
          <h1>Commentaires</h1>
          <small className="truncate">Sur cette page : {pageUrl ?? "…"}</small>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Fermer les commentaires" onClick={() => tellSite({ type: "kora:close" })}>
          <X />
        </Button>
      </header>

      {inBubble ? (
        // Opened from the list (or a pin, the list open): read under the list's header, back to it after.
        <section className="site-bubble is-docked" aria-label={draft ? "Nouveau commentaire" : "Commentaire"}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="site-back"
            onClick={() => {
              setDraft(null);
              setOpenId(null);
            }}
          >
            <ArrowLeft /> Tous les commentaires
          </Button>
          {commentView}
        </section>
      ) : onPage.length ? (
        <ul className="site-comments" aria-label="Commentaires de la page">
          {onPage.map((comment) => (
            <li key={comment.id}>
              <button
                type="button"
                className="site-comment"
                aria-label={`${itemLabel(comment)} #${comment.id}`}
                onClick={() => {
                  setOpenId(comment.id);
                  tellSite({ type: "kora:focus", id: comment.id });
                }}
              >
                <span className={`site-comment-avatar ${sideOf(comment) === "agency" ? "is-agency" : ""}`} aria-hidden="true">
                  {comment.initials}
                </span>
                <span className="site-comment-body">
                  <span className="site-comment-author">{comment.author}</span>
                  <span className="site-comment-text">{requestText(comment)}</span>
                  {comment.replies?.length ? <small>{plural(comment.replies.length, "réponse")}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="site-comments-empty">
          <span className="site-comments-empty-icon" aria-hidden="true">
            <MessageCirclePlus />
          </span>
          <b>Aucun commentaire sur cette page</b>
          <p>Choisissez « Commenter » dans la barre Kora, en bas de l’écran, puis cliquez sur l’élément à commenter.</p>
        </div>
      )}

      {/* The follow-up, quotes and validation are on Kora's pages, where no page of the site can frame them. */}
      <footer className="site-panel-footer">
        {waiting && (
          <p role="status" className="site-panel-waiting">
            {waiting}
          </p>
        )}
        <p className={due && !waiting ? "site-panel-waiting" : undefined}>Le suivi des demandes, les devis et la validation se font dans Kora.</p>
        {agency ? (
          <Button asChild variant="outline" className="w-full">
            <a href={viewer.agency?.href ?? "/"} target="_blank" rel="noopener">
              Ouvrir la revue dans Kora <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={openReview}>
            Ouvrir la revue dans Kora <ExternalLink />
          </Button>
        )}
      </footer>
    </main>
  );
}
