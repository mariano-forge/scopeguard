// What the « Suivi » tab shows of a project, computed from what Kora already holds: what its out-of-scope
// requests brought (quoted, sent, accepted, refused), its deliverables' round trips (versions) and how
// their requests fall from one version to the next, its requests over time, and how fast the agency
// answers the client. Times come from the requests and replies (createdAt); amounts from the quotes.
// A deliverable and a period narrow what is counted: the period applies to the requests (when they came),
// not to the versions, which carry no reliable date. Pure: the page passes today.

import type { ProjectScope } from "@/lib/projectScope";
import { sideOf } from "@/lib/authors";
import type { OutsideStatus } from "@/lib/outsideStatus";
import { isAgencyDraft, requestKind } from "./editor/CanvasComments";

type Version = { id: number; projectId?: number; name: string; version: number; status: string; reviewStatus?: string };
type Message = { from?: unknown; initials?: unknown; createdAt?: number };
type Request = Parameters<typeof isAgencyDraft>[0] & Message & { id: number; deliverableId?: number; replies?: Message[] };

export type RequestCounts = { included: number; outside: number; pending: number };
export type Amounted = { count: number; amount: number };
export type LivrableTracking = {
  id: number;
  name: string;
  versions: number;
  approved: boolean;
  /** Its requests on each version, the first one first: falling, the deliverable converges. */
  perVersion: { version: number; requests: number }[];
};

/** The periods one can look at, in days (none: since the first request). */
export const trackingPeriods = { "28": "4 dernières semaines", "90": "3 derniers mois", "365": "12 derniers mois", all: "Depuis le début" } as const;
export type TrackingPeriod = keyof typeof trackingPeriods;

export type ProjectTracking = {
  budget?: number;
  requests: RequestCounts & { total: number };
  /** The out-of-scope requests, from found to decided: what Kora turned into paid work. */
  outside: { found: number; unquoted: number; quoted: Amounted; sent: Amounted; awaiting: Amounted; accepted: Amounted; refused: Amounted };
  /** Every deliverable of the project, the most revised first (what the filter offers). */
  allLivrables: LivrableTracking[];
  /** The deliverables counted: all, or the one chosen. */
  livrables: LivrableTracking[];
  /** Requests received in each week (Monday first), or each month over a long period. */
  buckets: { unit: "week" | "month"; list: (RequestCounts & { start: string })[] };
  /** The agency's first answer to a client's request: its median delay, over how many requests. */
  response: { median?: number; count: number };
};

const day = 24 * 60 * 60 * 1000;
/** Beyond this many weeks, the chart counts by month. */
const maxWeeks = 26;
const isoOf = (at: Date) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

/** The start, at midnight, of a time's week (its Monday) or month. */
function startOf(at: number, unit: "week" | "month") {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  if (unit === "month") date.setDate(1);
  else date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}
function after(date: Date, unit: "week" | "month") {
  const next = new Date(date);
  if (unit === "month") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 7);
  return next;
}

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const counted = (requests: Request[]): RequestCounts => ({
  included: requests.filter((request) => requestKind(request) === "correction").length,
  outside: requests.filter((request) => requestKind(request) === "outside").length,
  pending: requests.filter((request) => requestKind(request) === "comment").length,
});

export function projectTracking(input: {
  projectId: number;
  scope?: ProjectScope;
  versions: Version[];
  requests: Request[];
  /** Where an out-of-scope request's quote stands, and its amount (src/lib/outsideStatus.ts). */
  quoteOf: (commentId: number) => { status: OutsideStatus; amount: number };
  /** The deliverable looked at (its first version's id), or all. */
  livrableId?: number;
  period?: TrackingPeriod;
  /** Today, as a time (the page's clock). */
  now: number;
}): ProjectTracking {
  const versions = input.versions.filter((record) => (record.projectId ?? 1) === input.projectId);

  // A deliverable: its versions under one name, named by the first one's id (as the routes do).
  const groups = new Map<string, Version[]>();
  for (const record of versions) groups.set(record.name, [...(groups.get(record.name) ?? []), record]);
  const grouped = [...groups.values()].map((records) => [...records].sort((left, right) => left.version - right.version));
  const chosen = grouped.filter((records) => input.livrableId === undefined || records[0]!.id === input.livrableId);
  const ids = new Set(chosen.flat().map((record) => record.id));

  // The agency's unqualified pins are its drafts: not requests yet. The period keeps those that came in it.
  const since = input.period && input.period !== "all" ? input.now - Number(input.period) * day : undefined;
  const ofProject = input.requests.filter((request) => !isAgencyDraft(request));
  const inPeriod = (request: Request) => since === undefined || (request.createdAt !== undefined && request.createdAt >= since);
  const requests = ofProject.filter((request) => ids.has(request.deliverableId ?? -1) && inPeriod(request));

  const livrableOf = (records: Version[], pool: Request[]): LivrableTracking => {
    const latest = records.at(-1)!;
    return {
      id: records[0]!.id,
      name: latest.name,
      versions: records.length,
      approved: latest.reviewStatus === "approved" || latest.status === "Approuvée",
      perVersion: records.map((record) => ({ version: record.version, requests: pool.filter((request) => request.deliverableId === record.id).length })),
    };
  };
  const byRevisions = (left: LivrableTracking, right: LivrableTracking) => right.versions - left.versions || left.name.localeCompare(right.name, "fr");
  const allIds = new Set(versions.map((record) => record.id));
  const allRequests = ofProject.filter((request) => allIds.has(request.deliverableId ?? -1) && inPeriod(request));
  const allLivrables = grouped.map((records) => livrableOf(records, allRequests)).sort(byRevisions);
  const livrables = allLivrables.filter((livrable) => ids.has(livrable.id));

  const quotes = requests.filter((request) => requestKind(request) === "outside").map((request) => input.quoteOf(request.id));
  const amounted = (statuses: OutsideStatus[]): Amounted => {
    const picked = quotes.filter((quote) => statuses.includes(quote.status));
    return { count: picked.length, amount: picked.reduce((total, quote) => total + quote.amount, 0) };
  };

  // Week by week (month by month over a long span), from the period's start or the first request.
  const times = requests.flatMap((request) => (request.createdAt ? [request.createdAt] : []));
  const list: ProjectTracking["buckets"]["list"] = [];
  const first = since ?? (times.length ? Math.min(...times) : undefined);
  const unit = first !== undefined && input.now - first > maxWeeks * 7 * day ? "month" : "week";
  if (first !== undefined) {
    const last = startOf(input.now, unit).getTime();
    for (let start = startOf(first, unit); start.getTime() <= last; start = after(start, unit)) {
      const end = after(start, unit).getTime();
      const inBucket = requests.filter((request) => request.createdAt !== undefined && request.createdAt >= start.getTime() && request.createdAt < end);
      list.push({ start: isoOf(start), ...counted(inBucket) });
    }
  }

  // The agency's first reply to each request the client wrote.
  const delays = requests.flatMap((request) => {
    if (sideOf(request) !== "client" || !request.createdAt) return [];
    const answer = (request.replies ?? []).find((reply) => sideOf(reply) === "agency" && reply.createdAt !== undefined && reply.createdAt >= request.createdAt!);
    return answer ? [answer.createdAt! - request.createdAt] : [];
  });

  return {
    budget: input.scope?.budget,
    requests: { ...counted(requests), total: requests.length },
    outside: {
      found: quotes.length,
      unquoted: quotes.filter((quote) => quote.status === "unquoted").length,
      quoted: amounted(["quoted", "sent", "counter", "accepted", "refused"]),
      sent: amounted(["sent", "counter", "accepted", "refused"]),
      awaiting: amounted(["sent", "counter"]),
      accepted: amounted(["accepted"]),
      refused: amounted(["refused"]),
    },
    allLivrables,
    livrables,
    buckets: { unit, list },
    response: { median: median(delays), count: delays.length },
  };
}
