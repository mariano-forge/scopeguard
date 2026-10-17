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
};

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
  return { url, selector, x: left, y: top, viewport };
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

/** The one origin whose pages may frame the panel: the site of a « Lien » deliverable. */
export const siteOriginOf = (deliverable: { type?: unknown; url?: unknown } | undefined) => (deliverable?.type === "Link" ? originOf(deliverable.url) : null);

/** The page's origin as the panel's address names it (?parent=…), only when it is an origin and nothing more. */
export function parentOrigin(value: string | null) {
  const origin = originOf(value);
  return origin && origin === value ? origin : null;
}

/** What a pin on the site needs, and nothing of the request's text. */
export type SitePin = { id: number; number: number; selector: string; x: number; y: number };

/** Messages between the toolbar (on the site) and the panel (in the frame), both checking the sender. */
export type ToolbarMessage =
  | { type: "kora:page"; url: string }
  | { type: "kora:pick"; anchor: SiteAnchor; label: string }
  | { type: "kora:open"; id: number }
  | { type: "kora:missing"; ids: number[] };
export type PanelMessage = { type: "kora:ready" } | { type: "kora:pins"; pins: SitePin[] } | { type: "kora:pick-mode"; on: boolean } | { type: "kora:focus"; id: number };
