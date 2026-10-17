"use client";

// Kora's panel on the agency's staging site, in a frame (see page.tsx). The toolbar on the site
// (public/kora-toolbar.js) picks the element and draws the pins; the panel verifies the client, holds
// the requests' text and writes them through the client's action routes (src/lib/reviewActions.ts).
// Every message is checked: from the site's origin and from the window that framed the panel only.

import { useEffect, useState } from "react";
import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestKind, requestText, statusLabels, statusTones, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { sideOf } from "@/lib/authors";
import { reviewAction } from "@/lib/reviewActions";
import { type PanelMessage, type SiteAnchor, type SitePin, type ToolbarMessage } from "@/lib/siteReview";
import { loadSharedState, subscribeSharedState } from "@/lib/stateSync";
import { AccessGate, ProfileGate } from "../AccessGate";

type Viewer = { mode: "client" | "preview" | "none"; verifiedEmail: string | null; invitation: { id: string | null; masked: string } | null; name: string | null; deliverable: string };
type Reply = { id: number; from?: string; initials?: string; author?: string; message: string };
type SiteComment = Pick<ThreadComment, "decision" | "title" | "message"> & { id: number; from?: string; initials?: string; author?: string; site?: SiteAnchor; replies?: Reply[] };

/** The requests placed on the site, in the order they were posted: their number on the pins. */
function siteRequestsOf(serialized: string | null): SiteComment[] {
  try {
    const state = JSON.parse(serialized ?? "null") as { comments?: SiteComment[] } | null;
    return (state?.comments ?? []).filter((comment) => comment.site).sort((left, right) => left.id - right.id);
  } catch {
    return [];
  }
}

export function SitePanel({ token, parent }: { token: string; parent: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  const [requests, setRequests] = useState<SiteComment[]>([]);
  /** The page the client is on, as the toolbar reports it. */
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ anchor: SiteAnchor; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [replyText, setReplyText] = useState("");
  const client = viewer?.mode === "client" && Boolean(viewer.name);

  const tellSite = (data: PanelMessage) => window.parent.postMessage(data, parent);

  useEffect(() => {
    let cancelled = false;
    const invitation = new URLSearchParams(window.location.search).get("invitation");
    fetch(`/api/review/${encodeURIComponent(token)}/access${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ""}`, { cache: "no-store" })
      .then(async (response) => !cancelled && response.ok && setViewer(await response.json()))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, accessCheck]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void loadSharedState(token).then((serialized) => !cancelled && setRequests(siteRequestsOf(serialized)));
    const unsubscribe = subscribeSharedState((serialized) => setRequests(siteRequestsOf(serialized)));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, token]);

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

  const onPage = requests.filter((request) => request.site?.url === pageUrl);
  const numberOf = (id: number) => requests.findIndex((request) => request.id === id) + 1;

  // The site draws the pins of its page: their number and place, never their text.
  const pins: SitePin[] = onPage.map((request) => ({ id: request.id, number: numberOf(request.id), selector: request.site!.selector, x: request.site!.x, y: request.site!.y }));
  const pinsKey = JSON.stringify(pins);
  useEffect(() => {
    window.parent.postMessage({ type: "kora:pins", pins: JSON.parse(pinsKey) as SitePin[] } satisfies PanelMessage, parent);
  }, [pinsKey, parent]);

  if (!viewer) return <main className="p-6 text-sm text-[var(--graphite)]">Chargement…</main>;
  if (viewer.mode === "none")
    return (
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
    );
  if (viewer.mode === "client" && !viewer.name && viewer.verifiedEmail)
    return <ProfileGate token={token} deliverable={viewer.deliverable} email={viewer.verifiedEmail} onSaved={(name) => setViewer({ ...viewer, name })} />;
  if (!client) return <main className="p-6 text-sm text-[var(--graphite)]">Ce panneau est réservé aux personnes invitées sur la revue.</main>;

  function startPicking() {
    setDraft(null);
    setPicking(true);
    tellSite({ type: "kora:pick-mode", on: true });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !message.trim()) return;
    const created = await reviewAction(token, "comments", "POST", { message: message.trim(), location: draft.anchor.url, site: draft.anchor });
    if (!created) return;
    setDraft(null);
    setMessage("");
    if (typeof created.id === "number") setOpenId(created.id);
  }

  async function reply(event: React.FormEvent, commentId: number) {
    event.preventDefault();
    if (!replyText.trim()) return;
    if (await reviewAction(token, `comments/${commentId}/replies`, "POST", { message: replyText.trim() })) setReplyText("");
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-[var(--paper)] p-4 text-sm text-[var(--ink)]">
      <header className="grid gap-1">
        <p className="text-xs font-semibold tracking-wide text-[var(--graphite)] uppercase">Revue · {viewer.deliverable}</p>
        <h1 className="font-heading text-base font-bold">Demandes de cette page</h1>
        <p className="truncate text-xs text-[var(--graphite)]">{pageUrl ?? "…"}</p>
      </header>

      {draft ? (
        <form className="grid gap-2 rounded-[var(--r-panel)] border border-[var(--border)] p-3" onSubmit={send}>
          <p className="text-xs text-[var(--graphite)]">
            Sur : <b className="text-[var(--ink)]">{draft.label || draft.anchor.selector}</b>
          </p>
          <Label htmlFor="site-request">Votre demande</Label>
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
          <Crosshair /> {picking ? "Cliquez sur un élément de la page…" : "Poser une demande"}
        </Button>
      )}

      <ol className="grid gap-2" aria-label="Demandes de cette page">
        {onPage.map((request) => {
          const kind = requestKind(request);
          const open = openId === request.id;
          return (
            <li key={request.id} className="rounded-[var(--r-panel)] border border-[var(--border)] p-3">
              <button type="button" className="flex w-full items-start gap-2 text-left" aria-expanded={open} onClick={() => (setOpenId(open ? null : request.id), tellSite({ type: "kora:focus", id: request.id }))}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--action-fill)] text-xs font-bold text-[var(--ink)]">{numberOf(request.id)}</span>
                <span className="grid min-w-0 gap-1">
                  <span className="font-medium">{requestText(request)}</span>
                  <span className={`decision-badge ${statusTones[kind]} w-fit`}>{statusLabels[kind]}</span>
                  {missing.includes(request.id) && (
                    <span className="flex items-center gap-1 text-xs text-[var(--status-high-text)]">
                      <MapPin className="size-3" /> Élément introuvable sur la page
                    </span>
                  )}
                </span>
              </button>
              {open && (
                <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
                  {request.title && <p>{request.message}</p>}
                  {(request.replies ?? []).map((item) => (
                    <p key={item.id} className="rounded-[var(--r-field)] bg-[var(--canvas)] px-2 py-1">
                      <b>{sideOf(item) === "agency" ? (item.author ?? "Agence") : (item.author ?? "Vous")}</b> : {item.message}
                    </p>
                  ))}
                  <form className="grid gap-2" onSubmit={(event) => void reply(event, request.id)}>
                    <Label htmlFor={`reply-${request.id}`}>Répondre</Label>
                    <Textarea id={`reply-${request.id}`} maxLength={5000} value={replyText} onChange={(event) => setReplyText(event.target.value)} />
                    <Button type="submit" variant="outline" disabled={!replyText.trim()}>
                      Répondre
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!onPage.length && !draft && <p className="text-[var(--graphite)]">Aucune demande sur cette page pour l’instant.</p>}

      {/* Quotes and the validation stay on the review page, where the decider sees everything. */}
      <a className="mt-auto flex items-center gap-1 text-[var(--action-text)] underline-offset-2 hover:underline" href={`/review/${encodeURIComponent(token)}`} target="_blank" rel="noopener">
        Devis et validation : ouvrir la revue complète <ExternalLink className="size-3" />
      </a>
    </main>
  );
}
