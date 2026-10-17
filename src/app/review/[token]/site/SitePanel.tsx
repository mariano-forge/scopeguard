"use client";

// Kora's panel on the agency's staging site, in a frame (see page.tsx). The toolbar on the site
// (public/kora-toolbar.js) picks the element and draws the pins; the panel verifies who is there,
// holds the requests' text and writes them through the action routes.
// - A client verifies by code (AccessGate) and writes through src/lib/reviewActions.ts.
// - An agency member is recognised by a Kora window (« Je suis de l'agence », src/lib/siteAgency.ts),
//   then comments, replies and qualifies through src/lib/agencyActions.ts; quotes are done in Kora.
// Every message is checked: from the site's origin and the window that framed the panel, or from the
// Kora window the panel opened.

import { useEffect, useRef, useState } from "react";
import { Crosshair, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteAgencyAction } from "@/lib/agencyActions";
import { reviewAction } from "@/lib/reviewActions";
import { type HandoffMessage, type PanelMessage, type SiteAnchor, type SitePin, type TicketMessage, type ToolbarMessage } from "@/lib/siteReview";
import { loadSharedState, subscribeSharedState } from "@/lib/stateSync";
import { uploadSiteCapture } from "@/lib/upload";
import { AccessGate, ProfileGate } from "../AccessGate";
import { SiteRequest, type SiteComment } from "./SiteRequest";

type Viewer = {
  mode: "client" | "preview" | "agency" | "none";
  verifiedEmail: string | null;
  invitation: { id: string | null; masked: string } | null;
  name: string | null;
  deliverable: string;
  agency: { name: string; href: string } | null;
  role: "decider" | "contributor" | null;
};

type VersionView = {
  requests: SiteComment[];
  deliverableId: number | null;
  /** Sent quotes waiting for the client's decision (not answered, no counter-proposal pending). */
  pendingQuotes: number;
  /** The version is not validated yet. */
  toValidate: boolean;
};

/** The requests placed on the site, in the order they were posted (their number on the pins), and what waits. */
function versionOf(serialized: string | null): VersionView {
  try {
    const state = JSON.parse(serialized ?? "null") as {
      comments?: SiteComment[];
      deliverables?: { id: number; reviewStatus?: string; status?: string }[];
      proposalStates?: Record<string, unknown>;
      proposalDecisions?: Record<string, unknown>;
      adaptationRequests?: Record<string, unknown>;
    } | null;
    const record = state?.deliverables?.[0];
    const pendingQuotes = Object.entries(state?.proposalStates ?? {}).filter(
      ([key, value]) => value === "sent" && !["accepted", "refused"].includes(String(state?.proposalDecisions?.[key])) && !state?.adaptationRequests?.[key],
    ).length;
    return {
      requests: (state?.comments ?? []).filter((comment) => comment.site).sort((left, right) => left.id - right.id),
      deliverableId: record?.id ?? null,
      pendingQuotes,
      toValidate: Boolean(record) && record?.reviewStatus !== "approved" && record?.status !== "Approuvée",
    };
  } catch {
    return { requests: [], deliverableId: null, pendingQuotes: 0, toValidate: false };
  }
}

export function SitePanel({ token, parent }: { token: string; parent: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  const [{ requests, deliverableId, pendingQuotes, toValidate }, setVersion] = useState(() => versionOf(null));
  /** The page the client is on, as the toolbar reports it. */
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  /** The request being written: where it was placed, and the capture of the window (undefined while it is made, null without). */
  const [draft, setDraft] = useState<{ pick: number; anchor: SiteAnchor; label: string; capture?: Blob | null; preview?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [agencyError, setAgencyError] = useState("");
  /** The « Je suis de l'agence » window: the only one whose ticket the panel takes. */
  const agencyWindow = useRef<Window | null>(null);
  /** The review tab opened from the panel, and the ticket it will be handed (src/lib/siteHandoff.ts). */
  const reviewTab = useRef<{ tab: Window; ticket: Promise<string | null> } | null>(null);
  const client = viewer?.mode === "client" && Boolean(viewer.name);
  const agency = viewer?.mode === "agency";

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
        setPicking(false);
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
    // Listening from now on: the toolbar answers with the page the client is on.
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

  /** Quotes and the validation are decided on the review page, opened in a tab without a second code. */
  function openReview() {
    const tab = window.open(`/review/${encodeURIComponent(token)}/site/ouvrir`, "_blank");
    if (!tab) return;
    const ticket = fetch(`/api/review/${encodeURIComponent(token)}/site/handoff`, { method: "POST" })
      .then(async (response) => (response.ok ? ((await response.json()) as { ticket?: string }).ticket ?? null : null))
      .catch(() => null);
    reviewTab.current = { tab, ticket };
  }

  const onPage = requests.filter((request) => request.site?.url === pageUrl);
  const numberOf = (id: number) => requests.findIndex((request) => request.id === id) + 1;

  // The site draws the pins of its page: their number and place, never their text.
  const pins: SitePin[] = onPage.map((request) => ({
    id: request.id,
    number: numberOf(request.id),
    selector: request.site!.selector,
    x: request.site!.x,
    y: request.site!.y,
    ...(request.clientSees === false ? { internal: true } : {}),
  }));
  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    window.parent.postMessage({ type: "kora:pins", pins: JSON.parse(pinsKey) as SitePin[] } satisfies PanelMessage, parent);
  }, [pinsKey, parent]);

  function openAgencyWindow() {
    setAgencyError("");
    agencyWindow.current = window.open(`/review/${encodeURIComponent(token)}/site/agence`, "kora-agence", "popup,width=460,height=600");
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

  function startPicking() {
    closeDraft();
    setPicking(true);
    tellSite({ type: "kora:pick-mode", on: true });
  }

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
    setSending(false);
    const body = { message: message.trim(), location: draft.anchor.url, site: { ...draft.anchor, ...(capture ? { capture } : {}) } };
    // The agency's remark stays internal until qualified, as a pin in Kora.
    const created = agency ? await siteAgencyAction("comments", "POST", { ...body, deliverableId }) : await reviewAction(token, "comments", "POST", body);
    if (!created) return;
    closeDraft();
    setMessage("");
    if (typeof created.id === "number") setOpenId(created.id);
  }

  const reply = async (commentId: number, text: string) =>
    Boolean(agency ? await siteAgencyAction(`comments/${commentId}/replies`, "POST", { message: text }) : await reviewAction(token, `comments/${commentId}/replies`, "POST", { message: text }));
  const qualify = async (commentId: number, decision: SiteComment["decision"], title: string) =>
    Boolean(await siteAgencyAction(`comments/${commentId}/qualification`, "PUT", { decision, ...(title ? { title } : {}) }));

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-[var(--paper)] p-4 text-sm text-[var(--ink)]">
      <header className="grid gap-1">
        <p className="text-xs font-semibold tracking-wide text-[var(--graphite)] uppercase">
          Revue · {viewer.deliverable}
          {agency && viewer.agency ? ` · Agence : ${viewer.agency.name}` : ""}
        </p>
        <h1 className="font-heading text-base font-bold">Demandes de cette page</h1>
        <p className="truncate text-xs text-[var(--graphite)]">{pageUrl ?? "…"}</p>
      </header>

      {client && (pendingQuotes > 0 || (toValidate && viewer.role === "decider")) && (
        <div role="status" className="grid gap-2 rounded-[var(--r-panel)] bg-[var(--status-medium-bg)] p-3 text-[var(--status-medium-text)]">
          <p>
            {pendingQuotes > 0
              ? `${pendingQuotes} devis ${pendingQuotes > 1 ? "attendent" : "attend"} votre décision.`
              : "La version attend votre validation."}{" "}
            Les décisions se prennent dans Kora.
          </p>
          <Button type="button" variant="outline" onClick={openReview}>
            Ouvrir dans Kora <ExternalLink />
          </Button>
        </div>
      )}

      {draft ? (
        <form className="grid gap-2 rounded-[var(--r-panel)] border border-[var(--border)] p-3" onSubmit={send}>
          <p className="text-xs text-[var(--graphite)]">
            Sur : <b className="text-[var(--ink)]">{draft.label || draft.anchor.selector}</b>
          </p>
          {draft.capture === undefined ? (
            <p className="text-xs text-[var(--graphite)]">Capture de la page en cours…</p>
          ) : draft.preview ? (
            // A plain image of the capture just made (a blob: address of this page).
            <span role="img" aria-label="Capture de la page" className="block aspect-video rounded-[var(--r-field)] border border-[var(--border)] bg-cover bg-top" style={{ backgroundImage: `url(${draft.preview})` }} />
          ) : (
            <p className="text-xs text-[var(--graphite)]">La capture n’a pas pu être faite : la demande partira sans.</p>
          )}
          <Label htmlFor="site-request">{agency ? "Votre remarque (interne jusqu’à sa qualification)" : "Votre demande"}</Label>
          <Textarea id="site-request" autoFocus maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={!message.trim() || draft.capture === undefined || sending}>
              Envoyer
            </Button>
            <Button type="button" variant="outline" onClick={closeDraft}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" onClick={startPicking} disabled={picking}>
          <Crosshair /> {picking ? "Cliquez sur un élément de la page…" : agency ? "Poser une remarque" : "Poser une demande"}
        </Button>
      )}

      <ol className="grid gap-2" aria-label="Demandes de cette page">
        {onPage.map((request) => (
          <SiteRequest
            key={request.id}
            request={request}
            number={numberOf(request.id)}
            open={openId === request.id}
            missing={missing.includes(request.id)}
            agency={agency}
            onToggle={() => {
              setOpenId(openId === request.id ? null : request.id);
              tellSite({ type: "kora:focus", id: request.id });
            }}
            onReply={(text) => reply(request.id, text)}
            onQualify={(decision, title) => qualify(request.id, decision, title)}
          />
        ))}
      </ol>
      {!onPage.length && !draft && <p className="text-[var(--graphite)]">Aucune demande sur cette page pour l’instant.</p>}

      {/* Quotes and the validation stay on Kora's pages, where no page of the site can frame them. */}
      {agency ? (
        <a className="mt-auto flex items-center gap-1 text-[var(--action-text)] underline-offset-2 hover:underline" href={viewer.agency?.href ?? "/"} target="_blank" rel="noopener">
          Devis et partage : ouvrir dans Kora <ExternalLink className="size-3" />
        </a>
      ) : (
        <Button type="button" variant="link" className="mt-auto h-auto justify-start px-0" onClick={openReview}>
          Devis et validation : ouvrir la revue dans Kora <ExternalLink className="size-3" />
        </Button>
      )}
    </main>
  );
}
