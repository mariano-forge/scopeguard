// A « Figma » deliverable (US-054): a Figma file, named by the link the agency pastes, reviewed one round
// at a time. Shared by the pages (the dialogs) and the server (src/db/workspaceActions.ts), which checks it.

/**
 * Whether « Nouveau livrable » offers « Dans Figma » (the client comments in Figma, Kora imports the comments).
 * Off unless FIGMA_COMMENTS=1 (decided 24 October 2026): reading comments and each round's screens costs too
 * many of Figma's reads for personal plans, and soon for agencies; offered again when people ask for it. The
 * code stays, and a deliverable made that way still works.
 */
export const figmaCommentsOffered = process.env.NEXT_PUBLIC_FIGMA_COMMENTS === "1";

/** "https://www.figma.com/design/AbC123…/Maquette?node-id=1-2" -> "AbC123…"; null when it is no Figma file. */
export function figmaFileKey(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["www.figma.com", "figma.com"].includes(url.hostname)) return null;
  const [, kind, key] = url.pathname.split("/");
  return ["design", "file", "proto"].includes(kind) && /^[A-Za-z0-9]{10,128}$/.test(key ?? "") ? key : null;
}

/** The file's address as Kora keeps it: without the page, the selection or the tracking Figma adds. */
export const figmaFileUrl = (key: string) => `https://www.figma.com/design/${key}`;

export type FigmaPage = { id: string; name: string };
/** A version saved in the file's history (« V3 envoyée au client »): what a round of review is about. */
export type FigmaVersion = { id: string; label: string; createdAt: string; author: string };

/** What a « Figma » deliverable's version keeps of its file and its round. */
export type FigmaRound = {
  fileKey: string;
  fileName: string;
  pages: FigmaPage[];
  /** The pages the agency put up for review: comments elsewhere (drafts, archive) stay in Figma. */
  reviewed: string[];
  version: FigmaVersion;
  /**
   * Which page each top-level screen of the round's version is on (screen id -> page id), read at the
   * round's first import (src/db/figmaImport.ts): Figma pins a comment on a screen without naming its page.
   */
  frames?: Record<string, string>;
};

/**
 * What the dialogs choose and send: the pages up for review and the round's saved version. A new
 * deliverable adds `receipt`, the server's signed reading of the file's pages (src/lib/figmaReceipt.ts).
 */
export type FigmaChoice = { pages: string[]; versionId: string; receipt?: string };

const figmaId = (value: unknown) => (typeof value === "string" && /^[\w:;-]{1,100}$/.test(value) ? value : null);

/** The choice a page sends, or null when it is malformed. */
export function readFigmaChoice(value: unknown): FigmaChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { pages, versionId, receipt } = value as Record<string, unknown>;
  if (!Array.isArray(pages) || !pages.length || pages.length > 200) return null;
  if (receipt !== undefined && (typeof receipt !== "string" || receipt.length > 64_000)) return null;
  const ids = pages.map(figmaId);
  const version = figmaId(versionId);
  return version && ids.every(Boolean) ? { pages: [...new Set(ids as string[])], versionId: version, ...(typeof receipt === "string" ? { receipt } : {}) } : null;
}
