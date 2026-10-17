"use client";

// Kora's panel on the agency's staging site, in a frame (see page.tsx). It looks like Kora's « Demandes »
// panel because it is made of it: RequestPanel for the list, ThreadPopover for a request's thread. The
// toolbar on the site (public/kora-toolbar.js) picks the element (its comment button, or C) and draws Kora's pins; the panel verifies
// who is there, holds the requests' text and writes them through the action routes.
// - A client verifies by code (AccessGate) and writes through src/lib/reviewActions.ts.
// - An agency member is recognised by a Kora window (« Je suis de l'agence », src/lib/siteAgency.ts),
//   then comments, replies and qualifies through src/lib/agencyActions.ts; quotes are sent from Kora.
// Every message is checked: from the site's origin and the window that framed the panel, or from the
// Kora window the panel opened.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { itemLabel, requestKind, ThreadPopover, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { RequestPanel, type InspectorTab } from "@/app/(agency)/editor/EditorInspector";
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

/** A request as the panel shows it: Kora's thread comment, placed on the site. */
type SiteComment = ThreadComment & { site?: SiteAnchor };

type VersionView = {
  requests: SiteComment[];
  deliverableId: number | null;
  /** Sent quotes waiting for the client's decision (not answered, no counter-proposal pending). */
  pendingQuotes: number;
  /** The version is not validated yet. */
  toValidate: boolean;
  /** Validated or replaced: read only. */
  closed: boolean;
};

/** The requests placed on the site, and what waits for the client. */
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
      requests: (state?.comments ?? [])
        .filter((comment) => comment.site)
        .map((comment) => ({ ...comment, decision: comment.decision === "Inclus" || comment.decision === "Hors périmètre" ? comment.decision : "À qualifier" })),
      deliverableId: record?.id ?? null,
      pendingQuotes,
      toValidate: Boolean(record) && !approved,
      closed: approved || Boolean(record?.locked) || record?.status === "Remplacée",
    };
  } catch {
    return { requests: [], deliverableId: null, pendingQuotes: 0, toValidate: false, closed: false };
  }
}

export function SitePanel({ token, parent }: { token: string; parent: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  const [{ requests, deliverableId, pendingQuotes, toValidate, closed }, setVersion] = useState(() => versionOf(null));
  /** The page the visitor is on, as the toolbar reports it. */
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  /** The request being written: where it was placed, and the capture of the window (undefined while it is made, null without). */
  const [draft, setDraft] = useState<{ pick: number; anchor: SiteAnchor; label: string; capture?: Blob | null; preview?: string } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("comment");
  /** The request whose thread is open. */
  const [openId, setOpenId] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [agencyError, setAgencyError] = useState("");
  /** The « Je suis de l'agence » window: the only one whose ticket the panel takes. */
  const agencyWindow = useRef<Window | null>(null);
  /** The review tab opened from the panel, and the ticket it will be handed (src/lib/siteHandoff.ts). */
  const reviewTab = useRef<{ tab: Window; ticket: Promise<string | null> } | null>(null);
  const client = viewer?.mode === "client" && Boolean(viewer.name);
  const agency = viewer?.mode === "agency";
  const me = agency ? "agency" : "client";

  const tellSite = (data: PanelMessage) => window.parent.postMessage(data, parent);

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
        setDraft({ pick: Number(data.pick), anchor: data.anchor, label: String(data.label ?? "").slice(0, 120) });
      } else if (data.type === "kora:capture") {
        // A JPEG or PNG of a few megabytes at most (the server checks it again, src/lib/siteCapture.ts).
        const blob = data.blob instanceof Blob && /^image\/(jpeg|png)$/.test(data.blob.type) && data.blob.size <= 3 * 1024 * 1024 ? data.blob : null;
        const preview = blob ? URL.createObjectURL(blob) : undefined;
        setDraft((current) => (current && current.pick === Number(data.pick) ? { ...current, capture: blob, preview } : current));
      } else if (data.type === "kora:open" && typeof data.id === "number") setOpenId(data.id);
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

  const onPage = requests.filter((request) => request.site?.url === pageUrl);

  // The site draws the pins of its page as Kora does: place, status, initials, label; never the text.
  const pins: SitePin[] = onPage.map((request) => ({
    id: request.id,
    selector: request.site!.selector,
    x: request.site!.x,
    y: request.site!.y,
    kind: requestKind(request),
    initials: request.initials ?? "",
    agency: sideOf(request) === "agency",
    label: itemLabel(request),
  }));
  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    window.parent.postMessage({ type: "kora:pins", pins: JSON.parse(pinsKey) as SitePin[] } satisfies PanelMessage, parent);
  }, [pinsKey, parent]);

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
  if (!client && !agency) return <main className="p-6 text-sm text-[var(--graphite)]">Ce panneau est réservé aux personnes invitées sur la revue.</main>;

  // ——— Gestures, through the route of the side the panel writes for ———

  const act = (path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: Record<string, unknown>) =>
    agency ? siteAgencyAction(path, method, body) : reviewAction(token, path, method, body);

  function closeDraft() {
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    setDraft(null);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !message.trim() || sending) return;
    setSending(true);
    // The capture goes first: the request names it (a request without one if it could not be sent).
    const capture = draft.capture ? await uploadSiteCapture(token, draft.capture) : null;
    const body = { message: message.trim(), location: draft.anchor.url, site: { ...draft.anchor, ...(capture ? { capture } : {}) } };
    // The agency's remark stays internal until qualified, as a pin in Kora.
    const created = await act("comments", "POST", agency ? { ...body, deliverableId } : body);
    setSending(false);
    if (!created) return;
    closeDraft();
    setMessage("");
    setTab("comment");
    if (typeof created.id === "number") setOpenId(created.id);
  }

  const opened = onPage.find((request) => request.id === openId) ?? requests.find((request) => request.id === openId);

  return (
    <main className="inspector site-panel" aria-label="Demandes">
      <header className="requests-header">
        <div className="grid min-w-0 gap-0.5">
          <h1 className="font-heading text-base font-bold">Demandes</h1>
          <small className="truncate text-xs text-[var(--graphite)]">
            {agency && viewer.agency ? `Agence : ${viewer.agency.name} · ` : ""}
            {pageUrl ?? "…"}
          </small>
        </div>
      </header>

      {client && (pendingQuotes > 0 || (toValidate && viewer.role === "decider")) && (
        <div role="status" className="mx-4 mb-3 grid gap-2 rounded-[var(--r-panel)] bg-[var(--status-medium-bg)] p-3 text-sm text-[var(--status-medium-text)]">
          <p>
            {pendingQuotes > 0 ? `${pendingQuotes} devis ${pendingQuotes > 1 ? "attendent" : "attend"} votre décision.` : "La version attend votre validation."} Les décisions se prennent dans Kora.
          </p>
          <Button type="button" variant="outline" onClick={openReview}>
            Ouvrir dans Kora <ExternalLink />
          </Button>
        </div>
      )}

      {draft && closed ? (
        // The version is validated or replaced: nothing more is written on it.
        <p role="status" className="mx-4 mb-3 rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
          Cette version est close : plus aucune demande n’y est possible.{" "}
          <button type="button" className="underline" onClick={closeDraft}>
            Fermer
          </button>
        </p>
      ) : draft ? (
        <form className="manual-comment" onSubmit={send}>
          <p className="text-xs text-[var(--graphite)]">
            Sur : <b className="text-[var(--ink)]">{draft.label || draft.anchor.selector}</b>
          </p>
          {draft.capture === undefined ? (
            <p className="text-xs text-[var(--graphite)]">Capture de la page en cours…</p>
          ) : draft.preview ? (
            // The capture just made (a blob: address of this page).
            <span role="img" aria-label="Capture de la page" className="block aspect-video rounded-[var(--r-field)] border border-[var(--border)] bg-cover bg-top" style={{ backgroundImage: `url(${draft.preview})` }} />
          ) : (
            <p className="text-xs text-[var(--graphite)]">La capture n’a pas pu être faite : la demande partira sans.</p>
          )}
          <textarea
            autoFocus
            rows={3}
            maxLength={5000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label={agency ? "Votre remarque (interne jusqu’à sa qualification)" : "Votre demande"}
            placeholder={agency ? "Une remarque pour l’équipe…" : "Ce que vous souhaitez changer ici…"}
          />
          <div className="manual-comment-actions">
            <button type="button" className="ghost-button" onClick={closeDraft}>
              Annuler
            </button>
            <button type="submit" className="primary-button" disabled={!message.trim() || draft.capture === undefined || sending}>
              Envoyer
            </button>
          </div>
        </form>
      ) : opened ? (
        <div className="site-thread">
          <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setOpenId(null)}>
            <ArrowLeft /> Demandes
          </Button>
          {missing.includes(opened.id) && (
            <p className="flex items-center gap-1 px-1 text-xs text-[var(--status-high-text)]">
              <MapPin className="size-3" /> Élément introuvable sur la page : la capture montre ce qui était visé.
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
              !closed && sideOf(opened) === me && requestKind(opened) === "comment"
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
        </div>
      ) : (
        <RequestPanel
          comments={onPage}
          selectedId={openId}
          tab={tab}
          onTab={setTab}
          onFocus={(id) => {
            setOpenId(id);
            tellSite({ type: "kora:focus", id });
          }}
          adding={false}
          onAddingChange={() => undefined}
          emptyHint="Aucune demande sur cette page. Cliquez sur la bulle en bas de l’écran, puis sur un élément du site."
        />
      )}

      {/* Quotes and the validation stay on Kora's pages, where no page of the site can frame them. */}
      <footer className="mt-auto border-t border-[var(--border)] px-4 py-3">
        {agency ? (
          <a className="flex items-center gap-1 text-sm text-[var(--action-text)] underline-offset-2 hover:underline" href={viewer.agency?.href ?? "/"} target="_blank" rel="noopener">
            Devis et partage dans Kora <ExternalLink className="size-3" />
          </a>
        ) : (
          <Button type="button" variant="link" className="h-auto px-0" onClick={openReview}>
            Devis et validation dans Kora <ExternalLink className="size-3" />
          </Button>
        )}
      </footer>
    </main>
  );
}
