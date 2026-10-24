// Figma screens reviewed in Kora (US-054, step 2c): the agency picks screens of a Figma file, Kora copies
// them as images (or PDF), and the client comments on them in Kora, without a Figma account. Shared by the
// dialogs and the server (src/db/figmaScreens.ts), which checks what a page sends.

/** A screen at the top of a page of the file, or in a section there: what the agency picks. */
export type FigmaScreen = { id: string; name: string; pageId: string; pageName: string; width: number; height: number };

/**
 * Figma's four export formats, in its order, chosen screen by screen (PNG by default): each one Kora stores
 * as Figma gives it. PNG and JPEG are drawn at twice the size, so text stays sharp at zoom.
 */
export const screenFormats = {
  png: { label: "PNG", hint: "fidèle, avec la transparence (conseillé)", mimeType: "image/png" },
  jpg: { label: "JPEG", hint: "plus léger, pour les écrans pleins de photos", mimeType: "image/jpeg" },
  svg: { label: "SVG", hint: "vectoriel, net à tous les zooms ; lourd avec des photos", mimeType: "image/svg+xml" },
  pdf: { label: "PDF", hint: "vectoriel, net à tous les zooms", mimeType: "application/pdf" },
} as const;
export type ScreenFormat = keyof typeof screenFormats;
export const screenFormatList = Object.keys(screenFormats) as ScreenFormat[];
export const readScreenFormat = (value: unknown): ScreenFormat | null => (typeof value === "string" && Object.hasOwn(screenFormats, value) ? (value as ScreenFormat) : null);
/** The format a stored screen was copied in (a new version copies it again in the same one). */
export const formatOfMime = (mimeType: string): ScreenFormat => screenFormatList.find((format) => screenFormats[format].mimeType === mimeType) ?? "png";

/** Each screen picked with its format: known shape, no repeat, at most maxScreens; null when malformed. */
export function readScreenFormats(value: unknown): Record<string, ScreenFormat> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > maxScreens) return null;
  const read = entries.map(([id, format]) => [screenId(id), readScreenFormat(format)] as const);
  return read.every(([id, format]) => id && format) ? (Object.fromEntries(read) as Record<string, ScreenFormat>) : null;
}

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
