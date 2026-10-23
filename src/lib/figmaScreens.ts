// Figma screens reviewed in Kora (US-054, step 2c): the agency picks screens of a Figma file, Kora copies
// them as images (or PDF), and the client comments on them in Kora, without a Figma account. Shared by the
// dialogs and the server (src/db/figmaScreens.ts), which checks what a page sends.

/** A screen at the top of a page of the file, or in a section there: what the agency picks. */
export type FigmaScreen = { id: string; name: string; pageId: string; pageName: string; width: number; height: number };

/** One format for a whole import: an image is light and quick; a PDF stays sharp at any zoom. */
export const screenFormats = { image: "Image", pdf: "PDF" } as const;
export type ScreenFormat = keyof typeof screenFormats;
export const readScreenFormat = (value: unknown): ScreenFormat | null => (value === "image" || value === "pdf" ? value : null);

/** At most this many screens per import: each is copied into Kora. */
export const maxScreens = 30;

/** A screen of a « Écrans Figma » version, as stored: its copy in Kora and where it came from. */
export type StoredScreen = FigmaScreen & { fileData: string; mimeType: string };

/** Screens per row on the canvas, from 1 to 8 (3 by default: desktop screens). */
export const readColumns = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8 ? value : 3);

const screenId = (value: unknown) => (typeof value === "string" && /^[\w:;-]{1,100}$/.test(value) ? value : null);

/** The screen ids a page sends: known shape, no repeat, at most maxScreens; null when malformed. */
export function readScreenIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > maxScreens) return null;
  const ids = value.map(screenId);
  return ids.every(Boolean) && new Set(ids).size === ids.length ? (ids as string[]) : null;
}
