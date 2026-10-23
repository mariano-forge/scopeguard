// Proof of what happened on one deliverable version, built from the database (never from the page):
// the file's fingerprint, every request with its qualification and quotes, and each decision with
// who made it, the server's time and the request's origin. The audit trail it reads is append-only.

import type { SiteAnchor } from "@/lib/siteReview";
import type { FigmaRound } from "@/lib/figmaLink";
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "./client";
import { organizations, users } from "./auth-schema";
import { auditEvents, clients, commentProposals, comments, deliverables, files, projects, proposalVersions, storedFiles } from "./schema";
import { deciderEventTypes } from "@/lib/clientRoles";
import { sourceLine, type RequestSource } from "@/lib/requestSource";

type Data = Record<string, unknown>;

export type ProofIdentity = { kind: "agency" | "client" | "request" | "unknown"; label: string };
export type ProofEvent = {
  type: string;
  description: string;
  actor: string;
  identity: ProofIdentity;
  recordedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  commentId: number | null;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** recorded_by -> who the server saw: a member (name and address), a verified client address, an access request. */
async function identities(db: Db, values: (string | null)[]) {
  const userIds = [...new Set(values.filter((value): value is string => Boolean(value) && !value!.includes(":")))];
  const members = userIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds)) : [];
  const byId = new Map(members.map((member) => [member.id, member]));
  return (value: string | null): ProofIdentity => {
    if (!value) return { kind: "unknown", label: "Non enregistré" };
    if (value.startsWith("client:")) return { kind: "client", label: `Client vérifié : ${value.slice(7)}` };
    if (value.startsWith("review-request:")) return { kind: "request", label: "Demande d’accès (adresse non vérifiée)" };
    const member = byId.get(value);
    return { kind: "agency", label: member ? `Agence : ${member.name} <${member.email}>` : "Agence : membre retiré" };
  };
}

/** A client's decisions are a decider's: the server refuses them to contributors (src/lib/clientRoles.ts). */
const decider = (identity: ProofIdentity, type: string | null): ProofIdentity =>
  identity.kind === "client" && type && deciderEventTypes.has(type) ? { ...identity, label: identity.label.replace("Client vérifié", "Client vérifié, décideur") } : identity;

export async function buildProof(db: Db, org: string, deliverableId: number, generatedBy: { name: string; email: string }) {
  const [record] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  if (!record) return null;
  const version = record.data as Data;

  const [[agency], [project]] = await Promise.all([
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, org)).limit(1),
    record.projectId === null
      ? Promise.resolve([] as { name: string; clientId: number | null }[])
      : db.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(and(eq(projects.organizationId, org), eq(projects.id, record.projectId))).limit(1),
  ]);
  const [client] =
    project?.clientId != null
      ? await db.select({ name: clients.name }).from(clients).where(and(eq(clients.organizationId, org), eq(clients.id, project.clientId))).limit(1)
      : [];

  // The file's fingerprint: recorded with it in Azure storage, or its name for files kept in Postgres before.
  const fileId = /^\/api\/files\/([0-9a-f-]{36}|[0-9a-f]{64})$/.exec(text(version.fileData))?.[1] ?? null;
  const file = !fileId
    ? null
    : fileId.length === 64
      ? ((await db.select({ sha256: files.id, mimeType: files.mimeType, size: files.size }).from(files).where(eq(files.id, fileId)).limit(1))[0] ?? null)
      : ((
          await db
            .select({ sha256: storedFiles.sha256, mimeType: storedFiles.mimeType, size: storedFiles.size, originalName: storedFiles.originalName })
            .from(storedFiles)
            .where(and(eq(storedFiles.organizationId, org), eq(storedFiles.id, fileId)))
            .limit(1)
        )[0] ?? null);

  const requestRows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.organizationId, org), eq(comments.deliverableId, deliverableId)))
    .orderBy(asc(comments.position), asc(comments.id));
  const commentIds = requestRows.map((row) => row.id);
  const [proposals, quotes, eventRows] = await Promise.all([
    commentIds.length ? db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), inArray(commentProposals.commentId, commentIds))) : [],
    commentIds.length
      ? db
          .select()
          .from(proposalVersions)
          .where(and(eq(proposalVersions.organizationId, org), inArray(proposalVersions.commentId, commentIds)))
          .orderBy(asc(proposalVersions.position))
      : [],
    db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, org),
          commentIds.length ? or(eq(auditEvents.deliverableId, deliverableId), inArray(auditEvents.commentId, commentIds)) : eq(auditEvents.deliverableId, deliverableId),
        ),
      )
      .orderBy(asc(auditEvents.recordedAt), asc(auditEvents.id)),
  ]);

  const identify = await identities(db, eventRows.map((row) => row.recordedBy));
  const events: ProofEvent[] = eventRows.map((row) => ({
    type: row.type,
    description: text((row.data as Data).description),
    actor: row.actor,
    identity: decider(identify(row.recordedBy), row.type),
    recordedAt: row.recordedAt.toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    commentId: row.commentId,
  }));
  const last = (type: string, commentId?: number) =>
    [...events].reverse().find((event) => event.type === type && (commentId === undefined || event.commentId === commentId)) ?? null;

  // Captures joined to requests entered by the agency, or taken on the staging site: their fingerprint goes in the proof.
  const siteOf = (data: Data) => (data.site && typeof data.site === "object" ? (data.site as SiteAnchor) : null);
  const sourceOf = (data: Data) => (data.source && typeof data.source === "object" ? (data.source as RequestSource) : null);
  const captureIds = requestRows
    .flatMap((row) => [sourceOf(row.data as Data)?.capture, siteOf(row.data as Data)?.capture])
    .map((href) => href?.split("/").at(-1))
    .filter((id): id is string => Boolean(id));
  const fingerprintOf = (href: string | undefined) => captures.find((capture) => capture.id === href?.split("/").at(-1))?.sha256 ?? null;
  const captures = captureIds.length
    ? await db.select({ id: storedFiles.id, sha256: storedFiles.sha256 }).from(storedFiles).where(and(eq(storedFiles.organizationId, org), inArray(storedFiles.id, captureIds)))
    : [];

  const requests = requestRows.map((row) => {
    const data = row.data as Data;
    const source = sourceOf(data);
    const proposal = proposals.find((candidate) => candidate.commentId === row.id);
    return {
      id: row.id,
      // A client's remark: their name and the address the server verified.
      author: text(data.authorEmail) && text(data.authorEmail) !== text(data.author) ? `${text(data.author)} <${text(data.authorEmail)}>` : text(data.author),
      message: text(data.message),
      location: text(data.location),
      qualification: text(data.decision),
      title: text(data.title),
      createdAt: typeof data.createdAt === "number" ? new Date(data.createdAt).toISOString() : null,
      source: source
        ? {
            // Brought in from Figma: nobody entered it; the name is the one Figma shows, which Kora did not check.
            line: data.figma ? `${sourceLine(source)} : commentaire de ${text(data.author)} (nom affiché par Figma, non vérifié par Kora), importé par Kora` : sourceLine(source, text(data.author)),
            excerpt: source.excerpt ?? null,
            captureSha256: fingerprintOf(source.capture),
          }
        : null,
      // Placed on the staging site: the page, the screen width and the capture of what was seen.
      site: siteOf(data) ? { url: siteOf(data)!.url, viewport: siteOf(data)!.viewport, captureSha256: fingerprintOf(siteOf(data)!.capture) } : null,
      quotes: quotes
        .filter((quote) => quote.commentId === row.id)
        .map((quote) => {
          const value = quote.data as Data;
          return { version: quote.version, description: text(value.description), amount: value.amount ?? null, deadline: value.deadline ?? null, status: quote.status };
        }),
      decision: proposal?.decision && proposal.decision !== "none" ? proposal.decision : null,
      decisionEvent: last("proposal.decision", row.id),
      adaptation: (proposal?.adaptation as Data | null) ?? null,
    };
  });

  const payload = {
    agency: agency?.name ?? "",
    client: client?.name ?? "",
    project: project?.name ?? "",
    deliverable: {
      id: record.id,
      name: record.name,
      version: record.version,
      type: text(version.type),
      url: text(version.url) || null,
      importedAt: text(version.importedAt),
      reviewStatus: record.reviewStatus ?? "pending",
      file: file ? { sha256: file.sha256, mimeType: file.mimeType, size: file.size, originalName: "originalName" in file ? file.originalName : null } : null,
      figma: figmaOf(version),
    },
    approval: record.reviewStatus === "approved" ? last("deliverable.approved") : null,
    changesRequested: record.reviewStatus === "changes-requested" ? last("review.changes-requested") : null,
    requests,
    events,
    generatedAt: new Date().toISOString(),
    generatedBy: `${generatedBy.name} <${generatedBy.email}>`,
  };
  // Fingerprint of this summary: the same content always gives the same value, any change gives another.
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, fingerprint };
}

export type Proof = NonNullable<Awaited<ReturnType<typeof buildProof>>>;

/**
 * A « Figma » version's round, as Figma told it when the round was made (src/lib/figmaLink.ts): the file,
 * the version saved in its history that was reviewed, and the pages up for review. Null for other kinds.
 */
function figmaOf(version: Record<string, unknown>) {
  const round = version.figma as FigmaRound | undefined;
  if (version.type !== "Figma" || !round?.version) return null;
  return {
    fileKey: round.fileKey,
    fileName: round.fileName,
    version: { id: round.version.id, label: round.version.label, savedAt: round.version.createdAt, savedBy: round.version.author },
    pages: round.pages.filter((page) => round.reviewed.includes(page.id)).map((page) => page.name),
  };
}
