// A project's reference scope (US-045): what was sold, as the agency reads it from its signed quote or
// the client's brief. Kept in the project's data (never sent to the review page, src/db/reviewAccess.ts),
// written whole by PUT /api/projects/:id/scope and made the reference by POST …/scope/activation.
// Shared by the page and the server: the server reads what the page sends with readScope.

export type ScopeSourceKind = "quote" | "brief" | "specs" | "other";
export const scopeSourceLabels: Record<ScopeSourceKind, string> = { quote: "Devis signé", brief: "Cahier des charges", specs: "Spécifications", other: "Autre document" };

/**
 * What the scope is read from: a PDF the agency imported itself (in the project's scope folder), or a
 * link to specs written elsewhere (Notion, Linear, Google Docs…), opened in a tab. One or the other.
 */
export type ScopeSource = { id: number; kind: ScopeSourceKind; name: string; file?: string; url?: string };
/** Something sold: « Pages intérieures · 5 pages », and where it is written (« CDC §2.3 »). */
export type ScopeLine = {
  id: number;
  title: string;
  quantity?: number;
  unit?: string;
  source?: string;
};
/** Something said not to be included: « Rédaction des textes ». */
export type ScopeExclusion = { id: number; title: string; source?: string };

export type ProjectScope = {
  sources: ScopeSource[];
  lines: ScopeLine[];
  exclusions: ScopeExclusion[];
  /** Revision rounds included, for the whole project. */
  rounds?: number;
  /** Amount sold, in euros excluding tax. */
  budget?: number;
  /** Start of the project, YYYY-MM-DD. */
  startDate?: string;
  /** Planned delivery, YYYY-MM-DD. */
  deadline?: string;
  /** Set by the server only: when and by whom it became the project's reference. */
  activatedAt?: number;
  activatedBy?: string;
};

export const emptyScope = (): ProjectScope => ({ sources: [], lines: [], exclusions: [] });

export const scopeLimits = { lines: 200, exclusions: 100, sources: 20, title: 200, unit: 40, source: 120 };

const fileHref = /^\/api\/files\/[0-9a-f-]{36}$/;
const short = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);
const positiveId = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined);
const bounded = (value: unknown, max: number, integer = false) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isInteger(value)) ? value : undefined;
const isoDay = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value ? undefined : value;
};
/** An http(s) address, nothing else (no javascript:, no data:). */
export const webLink = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** « Notion », « Linear »…: the name a link is shown under, from its address. */
export function linkName(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const known: [RegExp, string][] = [
    [/(^|\.)notion\.(so|site)$/, "Notion"],
    [/(^|\.)linear\.app$/, "Linear"],
    [/^docs\.google\.com$/, "Google Docs"],
    [/(^|\.)figma\.com$/, "Figma"],
    [/(^|\.)atlassian\.net$/, "Confluence"],
  ];
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}

const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []);
const object = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/**
 * The scope a page sends, kept to what it may say: bounded words and numbers, files by their address,
 * rows without a title left out. Activation is never read from the page. Null when not a scope at all.
 */
export function readScope(value: unknown): ProjectScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const sources = list(input.sources, scopeLimits.sources).flatMap((raw) => {
    const source = object(raw);
    const kind = (["quote", "brief", "specs", "other"] as const).find((candidate) => candidate === source.kind);
    const file = typeof source.file === "string" && fileHref.test(source.file) ? source.file : undefined;
    const url = webLink(source.url);
    const id = positiveId(source.id);
    const name = short(source.name, scopeLimits.title);
    if (!kind || !id || !name || Boolean(file) === Boolean(url)) return [];
    return [file ? { id, kind, name, file } : { id, kind, name, url }];
  });
  const lines = list(input.lines, scopeLimits.lines).flatMap((raw) => {
    const line = object(raw);
    const id = positiveId(line.id);
    const title = short(line.title, scopeLimits.title);
    if (!id || !title) return [];
    return [
      {
        id,
        title,
        quantity: bounded(line.quantity, 1_000_000),
        unit: short(line.unit, scopeLimits.unit),
        source: short(line.source, scopeLimits.source),
      },
    ];
  });
  const exclusions = list(input.exclusions, scopeLimits.exclusions).flatMap((raw) => {
    const exclusion = object(raw);
    const id = positiveId(exclusion.id);
    const title = short(exclusion.title, scopeLimits.title);
    return id && title ? [{ id, title, source: short(exclusion.source, scopeLimits.source) }] : [];
  });
  return {
    sources,
    lines,
    exclusions,
    rounds: bounded(input.rounds, 100, true),
    budget: bounded(input.budget, 1_000_000_000),
    startDate: isoDay(input.startDate),
    deadline: isoDay(input.deadline),
  };
}

/**
 * What the client may read of a project's scope (src/db/reviewAccess.ts): once active only, what is
 * included and what is not, nothing else (no draft, no documents, no budget, no name of the agency's).
 */
export type ClientScope = { lines: Pick<ScopeLine, "id" | "title" | "quantity" | "unit">[]; exclusions: Pick<ScopeExclusion, "id" | "title">[]; activatedAt: number };
export function clientScope(value: unknown): ClientScope | undefined {
  const scope = readScope(value);
  const activatedAt = (value as { activatedAt?: unknown } | null)?.activatedAt;
  if (!scope || typeof activatedAt !== "number") return undefined;
  return {
    lines: scope.lines.map(({ id, title, quantity, unit }) => ({ id, title, ...(quantity !== undefined ? { quantity } : {}), ...(unit ? { unit } : {}) })),
    exclusions: scope.exclusions.map(({ id, title }) => ({ id, title })),
    activatedAt,
  };
}

/** Where the project stands: no scope, a draft being written, or the reference. */
export const scopeStatus = (scope: ProjectScope | undefined) => (!scope ? "empty" : scope.activatedAt ? "active" : "draft");

/** « 5 pages », « 2 », or nothing: a line's quantity as read. */
export const quantityLabel = (line: Pick<ScopeLine, "quantity" | "unit">) =>
  line.quantity === undefined ? (line.unit ?? "") : `${line.quantity.toLocaleString("fr-FR")}${line.unit ? ` ${line.unit}` : ""}`;

/**
 * A line with its quantity in its words, as lines are written since 25 October 2026 (« 5 pages intérieures »:
 * no column of its own, decided with the product owner): one written before, or read apart by the AI, reads
 * « Pages intérieures · 5 pages ». The server still reads `quantity` and `unit` from older data.
 */
export function writtenLine<T extends ScopeLine>(line: T): T {
  if (line.quantity === undefined && !line.unit) return line;
  const rest = { ...line };
  delete rest.quantity;
  delete rest.unit;
  return { ...rest, title: [line.title, quantityLabel(line)].filter(Boolean).join(" · ").slice(0, scopeLimits.title) };
}

/** An out-of-scope request whose quote the client accepted: it extends the scope, dated, on top of it. */
/** An amendment: a quote the client accepted, or an offer sent to them (`offered`: done for free, its value shown). */
export type ScopeAmendment = { commentId: number; title: string; deliverable: string; amount: number; days: number; href?: string; offered?: boolean };

/** « 12 000 € » */
export const euros = (amount: number) => `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
