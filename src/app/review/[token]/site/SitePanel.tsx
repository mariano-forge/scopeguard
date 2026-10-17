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
import { type PanelMessage, type SiteAnchor, type SitePin, type TicketMessage, type ToolbarMessage } from "@/lib/siteReview";
import { loadSharedState, subscribeSharedState } from "@/lib/stateSync";
import { AccessGate, ProfileGate } from "../AccessGate";
import { SiteRequest, type SiteComment } from "./SiteRequest";

type Viewer = {
  mode: "client" | "preview" | "agency" | "none";
  verifiedEmail: string | null;
  invitation: { id: string | null; masked: string } | null;
  name: string | null;
  deliverable: string;
  agency: { name: string; href: string } | null;
};

/** The requests placed on the site, in the order they were posted: their number on the pins. */
function siteRequestsOf(serialized: string | null): { requests: SiteComment[]; deliverableId: number | null } {
  try {
    const state = JSON.parse(serialized ?? "null") as { comments?: SiteComment[]; deliverables?: { id: number }[] } | null;
    return { requests: (state?.comments ?? []).filter((comment) => comment.site).sort((left, right) => left.id - right.id), deliverableId: state?.deliverables?.[0]?.id ?? null };
  } catch {
    return { requests: [], deliverableId: null };
  }
}

export function SitePanel({ token, parent }: { token: string; parent: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  const [{ requests, deliverableId }, setVersion] = useState(() => siteRequestsOf(null));
  /** The page the client is on, as the toolbar reports it. */
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ anchor: SiteAnchor; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [agencyError, setAgencyError] = useState("");
  /** The « Je suis de l'agence » window: the only one whose ticket the panel takes. */
  const agencyWindow = useRef<Window | null>(null);
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
    void loadSharedState(token).then((serialized) => !cancelled && setVersion(siteRequestsOf(serialized)));
    const unsubscribe = subscribeSharedState((serialized) => setVersion(siteRequestsOf(serialized)));
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
        setDraft({ anchor: data.anchor, label: String(data.label ?? "").slice(0, 120) });
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
    setDraft(null);
    setPicking(true);
    tellSite({ type: "kora:pick-mode", on: true });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !message.trim()) return;
    const body = { message: message.trim(), location: draft.anchor.url, site: draft.anchor };
    // The agency's remark stays internal until qualified, as a pin in Kora.
    const created = agency ? await siteAgencyAction("comments", "POST", { ...body, deliverableId }) : await reviewAction(token, "comments", "POST", body);
    if (!created) return;
    setDraft(null);
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

      {draft ? (
        <form className="grid gap-2 rounded-[var(--r-panel)] border border-[var(--border)] p-3" onSubmit={send}>
          <p className="text-xs text-[var(--graphite)]">
            Sur : <b className="text-[var(--ink)]">{draft.label || draft.anchor.selector}</b>
          </p>
          <Label htmlFor="site-request">{agency ? "Votre remarque (interne jusqu’à sa qualification)" : "Votre demande"}</Label>
          <Textarea id="site-request" autoFocus maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={!message.trim()}>
              Envoyer
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
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
      <a
        className="mt-auto flex items-center gap-1 text-[var(--action-text)] underline-offset-2 hover:underline"
        href={agency ? (viewer.agency?.href ?? "/") : `/review/${encodeURIComponent(token)}`}
        target="_blank"
        rel="noopener"
      >
        {agency ? "Devis et partage : ouvrir dans Kora" : "Devis et validation : ouvrir la revue complète"} <ExternalLink className="size-3" />
      </a>
    </main>
  );
}
