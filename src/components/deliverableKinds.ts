/** The kinds of deliverable an agency can submit for review. */
export type DeliverableType = "PDF" | "Image" | "Video" | "Link" | "Doc";

/** Tone = a Kora status pair (background + text, all ≥ 7:1), used for the default cover. */
export type KindTone = "resolved" | "clarify" | "scope" | "low" | "medium";

export const deliverableKinds: Record<
  DeliverableType,
  { label: string; badge: string; tone: KindTone; accept?: string; hint: string }
> = {
  Image: { label: "Image", badge: "IMG", tone: "resolved", accept: "image/*", hint: "PNG, JPG, SVG, WebP" },
  PDF: { label: "PDF", badge: "PDF", tone: "clarify", accept: "application/pdf,.pdf", hint: "Fichier PDF" },
  Video: { label: "Vidéo", badge: "VID", tone: "scope", accept: "video/*", hint: "MP4, WebM, MOV" },
  Link: { label: "Lien", badge: "URL", tone: "low", hint: "Adresse d’une page web (https://…)" },
  Doc: {
    label: "Document",
    badge: "DOC",
    tone: "medium",
    accept: ".doc,.docx,.odt,.pptx,.key,.xlsx,.txt,.md,.rtf",
    hint: "Word, PowerPoint, Excel, texte",
  },
};

export const deliverableTypes = Object.keys(deliverableKinds) as DeliverableType[];
/**
 * The kinds a new deliverable may take: no more « Document » (Word, PowerPoint…, which Kora could only offer
 * to download), decided with the product owner on 22 October 2026. Those already imported stay readable.
 */
export const newDeliverableTypes = deliverableTypes.filter((type) => type !== "Doc");
/** Said when a document is chosen anyway: what to do instead. */
export const documentRefused = "Les documents Word, PowerPoint ou Excel ne sont plus pris en charge : exportez-le en PDF.";

/** Largest import (MAX_UPLOAD_MB, exposed by next.config.ts); the server checks it again. */
export const MAX_FILE_BYTES = (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 50) * 1024 * 1024;
/** Largest video (MAX_VIDEO_UPLOAD_MB): a film weighs far more than a mock-up. */
export const MAX_VIDEO_BYTES = (Number(process.env.NEXT_PUBLIC_MAX_VIDEO_UPLOAD_MB) || 1024) * 1024 * 1024;
/** The import limit of a kind of deliverable. */
export const maxBytesOf = (type: DeliverableType) => (type === "Video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES);
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

/** Best guess of the kind from a file (used for new versions and the import dialog). */
export function kindFromFile(file: File): DeliverableType | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (file.type.startsWith("image/")) return "Image";
  if (file.type.startsWith("video/")) return "Video";
  if (/\.(docx?|odt|pptx|key|xlsx|txt|md|rtf)$/.test(name)) return "Doc";
  return null;
}

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
