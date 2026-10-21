// Review of a live website (US-048): the agency puts public/kora-toolbar.js on its staging site, which
// opens Kora's panel (/review/:token/site) in a frame. Shared by the server (what a request on a site
// may hold, where the panel may be framed) and the panel.
//
// The site's page only ever learns where to draw the pins (their number, element and position): the
// text of the requests stays inside the frame, on Kora's origin. Scripts of the site (analytics, chat…)
// never read what the client wrote.

/** Where a request was placed on the site: page, element and point within it, screen width. */
export type SiteAnchor = {
  /** Path and query of the page ("/contact?offre=2"), without the origin, which the link fixes. */
  url: string;
  /** CSS selector of the element clicked, as computed by the toolbar. */
  selector: string;
  /** Point of the click within the element, in % of its width and height. */
  x: number;
  y: number;
  /** Width of the window, in CSS pixels: the same page can differ on a phone. */
  viewport: number;
  /** The click on the capture of the window, in % of it. */
  view?: { x: number; y: number };
  /** The capture of the window at the click (/api/files/<id>), sent by whoever placed the request. */
  capture?: string;
};

/** The address of a stored file, as the capture of a request names it. */
export const captureHref = (value: unknown) => (typeof value === "string" && /^\/api\/files\/[0-9a-f-]{36}$/.test(value) ? value : undefined);

const percent = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined);

/** The anchor a request body names, or undefined when it is malformed. */
export function readSiteAnchor(value: unknown): SiteAnchor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { url, selector, x, y, viewport } = value as Record<string, unknown>;
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.length > 500) return undefined;
  if (typeof selector !== "string" || !selector.trim() || selector.length > 500) return undefined;
  const [left, top] = [percent(x), percent(y)];
  if (left === undefined || top === undefined) return undefined;
  if (typeof viewport !== "number" || !Number.isInteger(viewport) || viewport < 1 || viewport > 10_000) return undefined;
  const { view, capture } = value as Record<string, unknown>;
  const point = view && typeof view === "object" ? { x: percent((view as Record<string, unknown>).x), y: percent((view as Record<string, unknown>).y) } : null;
  return {
    url,
    selector,
    x: left,
    y: top,
    viewport,
    ...(point?.x !== undefined && point.y !== undefined ? { view: { x: point.x, y: point.y } } : {}),
    ...(captureHref(capture) ? { capture: captureHref(capture) } : {}),
  };
}

/** "https://recette.agence.fr" of an http(s) address; null for anything else. */
export function originOf(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** This computer, where a site in http is a developer's, not one anyone on the way could rewrite. */
const loopback = (origin: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);

/**
 * Whether the panel may open on this site: https only, but on this computer. A page in http can be
 * rewritten on its way (public Wi-Fi), and the rewritten page would frame Kora and talk to it.
 */
export const securedSite = (origin: string) => origin.startsWith("https://") || loopback(origin);

/** A site's address as a « Lien » keeps it: without the toolbar's ?kora, which the decider's link adds again. */
export function withoutToolbarFlag(value: string) {
  try {
    const url = new URL(value);
    if (!url.searchParams.has("kora")) return value;
    url.searchParams.delete("kora");
    return url.toString();
  } catch {
    return value;
  }
}

/** An address only this computer or its network reaches: 192.168.…, 10.…, 172.16–31.…, name.local. */
const privateHost = (hostname: string) =>
  hostname === "0.0.0.0" || hostname.endsWith(".local") || /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

/**
 * Why a « Lien » cannot be reviewed at this address, or null. The client opens it on their own device, and
 * the toolbar opens only in https: a site of this computer, or in http, has to be deployed first, or
 * reviewed at its preview's address. Checked by the forms and by the server (src/db/workspaceActions.ts).
 */
export function undeployedSiteProblem(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (loopback(url.origin) || privateHost(url.hostname))
    return "Cette adresse n’existe que sur votre ordinateur : le décideur ne pourra pas l’ouvrir. Déployez le site, ou donnez l’adresse de sa preview (https://…).";
  if (url.protocol !== "https:") return "Le site doit être en https:// pour que la barre Kora s’y ouvre. Donnez l’adresse de son déploiement ou de sa preview.";
  return null;
}

/** The one origin whose pages may frame the panel: the site of a « Lien » deliverable, in https. */
export function siteOriginOf(deliverable: { type?: unknown; url?: unknown } | undefined) {
  const origin = deliverable?.type === "Link" ? originOf(deliverable.url) : null;
  return origin && securedSite(origin) ? origin : null;
}

/** The staging site's address that shows the toolbar (?kora), for a « Lien » deliverable in https; null otherwise. */
export function siteClientUrl(deliverable: { type?: unknown; url?: unknown } | undefined) {
  if (!siteOriginOf(deliverable)) return null;
  const url = new URL(String(deliverable!.url));
  url.search = url.search ? `${url.search}&kora` : "?kora";
  return url.toString();
}

/** The page's origin as the panel's address names it (?parent=…), only when it is an origin and nothing more. */
export function parentOrigin(value: string | null) {
  const origin = originOf(value);
  return origin && origin === value ? origin : null;
}

/** The panel's agency session (src/lib/siteAgency.ts); named here for src/proxy.ts, which reads no database. */
export const siteAgencyCookie = "kora_agency_site_session";

/**
 * What an agency member may do from the panel on the staging site: comment, reply, qualify. Sending a
 * quote, answering a counter-proposal, reopening or sharing are done on Kora's pages, where no page of
 * the agency's site can lay a hidden button over them (AGENTS.md). Checked by the server.
 */
export const siteAgencyActions: ReadonlySet<string> = new Set(["comment.create", "comment.edit", "comment.delete", "comment.qualify", "reply.create", "reply.edit", "reply.delete"]);

/**
 * What a pin on the site needs to look like Kora's (src/app/(agency)/editor/CanvasComments.tsx CanvasPin):
 * its place, its status, its author's initials and side, and Kora's label (« Demande incluse »). Never the
 * request's text, amount or author's name and address: the site's other scripts can read what it receives.
 */
export type SitePin = {
  id: number;
  selector: string;
  x: number;
  y: number;
  kind: "comment" | "correction" | "outside";
  initials: string;
  agency: boolean;
  label: string;
};

/** Messages between the toolbar (on the site) and the panel (in the frame), both checking the sender. */
export type ToolbarMessage =
  | { type: "kora:page"; url: string }
  /** `pick` numbers the click: its capture follows in a kora:capture of the same number. */
  | { type: "kora:pick"; pick: number; anchor: SiteAnchor; label: string }
  /** The capture of the window at the click; null when it could not be made. */
  | { type: "kora:capture"; pick: number; blob: Blob | null }
  | { type: "kora:open"; id: number }
  | { type: "kora:missing"; ids: number[] }
  /** Kora closed from the toolbar: the bubble's comment is put away. */
  | { type: "kora:dismiss" }
  /** The list is open on the right: a comment then opens in it, not in a bubble that would take its place. */
  | { type: "kora:docked"; on: boolean };
/** Between the panel and the review tab it opened, without a second code (src/lib/siteHandoff.ts). */
export type HandoffMessage = { type: "kora:handoff-ready" } | { type: "kora:handoff-ticket"; ticket: string };
export type PanelMessage =
  | { type: "kora:ready" }
  /** Whether the visitor is in (a verified client with a name, or the agency): the bar then opens without the list. */
  | { type: "kora:signed"; in: boolean }
  | { type: "kora:pins"; pins: SitePin[] }
  | { type: "kora:focus"; id: number }
  /** The frame as a bubble next to the pin or the click (a comment written or read), or back to the list. */
  | { type: "kora:bubble"; open: boolean }
  /** The bubble's height, as tall as what it holds. */
  | { type: "kora:size"; height: number }
  /** The list's own close button. */
  | { type: "kora:close" };
