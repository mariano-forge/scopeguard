// Where a request entered by the agency came from (an e-mail, a call, a meeting…), with the client's
// own words or a capture: every request lands in the same register, whatever its channel. Shared by
// the server, which checks it, and the pages, which show it (the agency's and the client's).

export const requestChannels = { email: "E-mail", call: "Appel", meeting: "Réunion", slack: "Slack", figma: "Figma", other: "Autre" } as const;
export type RequestChannel = keyof typeof requestChannels;

export type RequestSource = {
  channel: RequestChannel;
  /** Day the client made it, "YYYY-MM-DD" (the request may be entered later). */
  receivedAt?: string;
  /** The client's words, pasted (an e-mail, a message). Shown to the client. */
  excerpt?: string;
  /** Address of a capture imported by the agency (/api/files/<id>). Shown to the client. */
  capture?: string;
};

export const excerptMaxLength = 5000;
const capturePattern = /^\/api\/files\/[0-9a-f-]{36}$/;

/** The source a page sends, or undefined when there is none; null when malformed. */
export function readRequestSource(value: unknown): RequestSource | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const { channel, receivedAt, excerpt, capture } = value as Record<string, unknown>;
  if (typeof channel !== "string" || !Object.hasOwn(requestChannels, channel)) return null;
  if (receivedAt !== undefined && (typeof receivedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) || Number.isNaN(Date.parse(receivedAt)))) return null;
  if (excerpt !== undefined && (typeof excerpt !== "string" || excerpt.length > excerptMaxLength)) return null;
  if (capture !== undefined && (typeof capture !== "string" || !capturePattern.test(capture))) return null;
  const words = typeof excerpt === "string" ? excerpt.trim() : "";
  return { channel: channel as RequestChannel, ...(receivedAt ? { receivedAt } : {}), ...(words ? { excerpt: words } : {}), ...(capture ? { capture } : {}) };
}

const channelPhrases: Record<RequestChannel, string> = {
  email: "par e-mail",
  call: "par téléphone",
  meeting: "en réunion",
  slack: "sur Slack",
  figma: "sur Figma",
  other: "par un autre canal",
};

/** "Demande reçue par e-mail le 14/10/2026, saisie par Alice Martin". */
export function sourceLine(source: RequestSource, enteredBy?: string) {
  const channel = channelPhrases[source.channel];
  const day = source.receivedAt ? ` le ${source.receivedAt.split("-").reverse().join("/")}` : "";
  return `Demande reçue ${channel}${day}${enteredBy ? `, saisie par ${enteredBy}` : ""}`;
}
