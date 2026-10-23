// How the agency organises its work, one action at a time (routes under /api/spaces, /api/projects,
// /api/deliverables and /api/trash): spaces, projects, deliverables and their versions, the trash.
// Built from what the database holds; run by runAgencyAction (agencyActions.ts), which applies the
// members' reserved actions (deleting a space or a project, emptying the trash).

import { and, eq, inArray } from "drizzle-orm";
import { readVideoDuration } from "@/lib/timecode";
import type { Entity, ListChange, SharedState, StateChanges } from "@/lib/sharedState";
import { undeployedSiteProblem, withoutToolbarFlag } from "@/lib/siteReview";
import { figmaFileKey, figmaFileUrl, readFigmaChoice, type FigmaChoice, type FigmaRound } from "@/lib/figmaLink";
import { id, noChanges, text, trail, type Data } from "./actions";
import type { Db } from "./client";
import { clients, deliverables, projects, storedFiles } from "./schema";
import { readState } from "./state";
import { loadFigmaVersions } from "./figmaConnection";
import type { FigmaImports } from "./figmaImport";
import { readFigmaReceipt, readFigmaScreensReceipt } from "@/lib/figmaReceipt";
import { maxScreens, readColumns, screenFormats, type StoredScreen } from "@/lib/figmaScreens";
import type { FigmaFileTree } from "@/lib/figma";

const deliverableTypes = ["PDF", "Image", "Video", "Link", "Doc", "Figma", "Screens"] as const;
type DeliverableType = (typeof deliverableTypes)[number];
/** Items stay restorable this long; then an administrator's page has them purged. */
export const trashDays = 30;

/**
 * `duration`: a video's length in seconds, read by the agency's browser; its files' links last that long (src/lib/storage.ts).
 * `figma`: a « Figma » round, the pages up for review and the saved version of the file (src/lib/figmaLink.ts).
 */
type NewFile = { kind: DeliverableType; size: number; fileData?: string; duration?: number; figma?: FigmaChoice; screens?: Screens };
/** « Écrans Figma »: the screens copied into Kora (src/db/figmaScreens.ts), in their order, and how many per row. */
type Screens = { picked: { id: string; fileData: string }[]; receipt: string; columns: number };

export type WorkspaceAction =
  | { type: "space.create"; id?: number; name: string; email?: string }
  | { type: "space.rename"; spaceId: number; name: string }
  | { type: "space.delete"; spaceId: number }
  | { type: "project.create"; id?: number; clientId: number; name: string }
  | { type: "project.rename"; projectId: number; name: string }
  | { type: "project.move"; projectId: number; clientId: number }
  | { type: "project.delete"; projectId: number }
  | ({ type: "livrable.create"; id?: number; projectId: number; name: string; url?: string; coverData?: string } & NewFile)
  // A version is of its deliverable's nature: a « Lien » by its address, a « Figma » by its round, any other kind by its file.
  | ({ type: "version.import"; livrableId: number; id?: number; fileData?: string; url?: string } & NewFile)
  | { type: "livrable.rename"; livrableId: number; name: string }
  | { type: "livrable.move"; livrableId: number; projectId: number }
  | { type: "livrable.delete"; livrableId: number }
  | { type: "link.auto-expire"; deliverableId: number; autoExpire: boolean }
  | { type: "trash.restore"; itemId: number }
  | { type: "trash.purge"; itemId?: number }
  | { type: "trash.purge-expired" };

export type WorkspaceParams = { spaceId?: string; projectId?: string; deliverableId?: string; itemId?: string };
type Refusal = { ok: false; status: number; error: string };
const refused = (error: string, status = 409): Refusal => ({ ok: false, status, error });

// ——— Reading what the page sends ———

const fileHrefPattern = /^\/api\/files\/[0-9a-f-]{36}$/;
const fileHref = (value: unknown) => (typeof value === "string" && fileHrefPattern.test(value) ? value : undefined);
const webAddress = (value: unknown) => {
  const address = text(value, 2000);
  try {
    return address && ["http:", "https:"].includes(new URL(address).protocol) ? address : undefined;
  } catch {
    return undefined;
  }
};
const deliverableType = (value: unknown) => (deliverableTypes as readonly unknown[]).includes(value) ? (value as DeliverableType) : undefined;
const size = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0);

/** The action described by a request body, or null when it is malformed. */
export function readWorkspaceAction(type: WorkspaceAction["type"], body: Data, params: WorkspaceParams = {}): WorkspaceAction | null {
  const [spaceId, projectId, deliverableId, itemId] = [params.spaceId, params.projectId, params.deliverableId, params.itemId].map((value) => id(Number(value)));
  const name = text(body.name, 200);
  switch (type) {
    case "space.create": {
      const email = text(body.email, 320);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      return name ? { type, id: id(body.id), name, email } : null;
    }
    case "space.rename":
      return spaceId && name ? { type, spaceId, name } : null;
    case "space.delete":
      return spaceId ? { type, spaceId } : null;
    case "project.create": {
      const clientId = id(body.clientId);
      return clientId && name ? { type, id: id(body.id), clientId, name } : null;
    }
    case "project.rename":
      return projectId && name ? { type, projectId, name } : null;
    case "project.move": {
      const clientId = id(body.clientId);
      return projectId && clientId ? { type, projectId, clientId } : null;
    }
    case "project.delete":
      return projectId ? { type, projectId } : null;
    case "livrable.create": {
      const target = id(body.projectId);
      const kind = deliverableType(body.type);
      if (!target || !name || !kind) return null;
      if ((body.fileData !== undefined && !fileHref(body.fileData)) || (body.coverData !== undefined && !fileHref(body.coverData))) return null;
      if (body.url !== undefined && !webAddress(body.url)) return null;
      const duration = kind === "Video" ? readVideoDuration(body.duration) : undefined;
      // A « Figma » is a file of Figma's, never one of Kora's, with its first round.
      const figma = kind === "Figma" ? readFigmaChoice(body.figma) : undefined;
      if (kind === "Figma" && (!figma || !figmaFileKey(String(body.url ?? "")) || body.fileData !== undefined)) return null;
      // « Écrans Figma »: screens of a Figma file, copied into Kora first.
      const screens = kind === "Screens" ? readScreens(body) : undefined;
      if (kind === "Screens" && (!screens || !figmaFileKey(String(body.url ?? "")) || body.fileData !== undefined)) return null;
      return {
        type,
        id: id(body.id),
        projectId: target,
        name,
        kind,
        size: size(body.size),
        fileData: fileHref(body.fileData),
        url: webAddress(body.url),
        coverData: fileHref(body.coverData),
        duration,
        ...(figma ? { figma } : {}),
        ...(screens ? { screens } : {}),
      };
    }
    case "version.import": {
      const kind = deliverableType(body.type);
      const fileData = fileHref(body.fileData);
      const url = webAddress(body.url);
      if (!deliverableId || !kind) return null;
      if (kind === "Screens") {
        // The same screens copied again, in their state now.
        const screens = readScreens(body);
        return screens && body.fileData === undefined && body.url === undefined ? { type, livrableId: deliverableId, id: id(body.id), kind, size: 0, screens } : null;
      }
      if (kind === "Figma") {
        // The same file, another round: its file is the deliverable's.
        const figma = readFigmaChoice(body.figma);
        return figma && body.fileData === undefined && body.url === undefined ? { type, livrableId: deliverableId, id: id(body.id), kind, size: 0, figma } : null;
      }
      if (kind === "Link" ? !url || body.fileData !== undefined : !fileData || body.url !== undefined) return null;
      return { type, livrableId: deliverableId, id: id(body.id), kind, size: size(body.size), fileData, url, duration: kind === "Video" ? readVideoDuration(body.duration) : undefined };
    }
    case "livrable.rename":
      return deliverableId && name ? { type, livrableId: deliverableId, name } : null;
    case "livrable.move": {
      const target = id(body.projectId);
      return deliverableId && target ? { type, livrableId: deliverableId, projectId: target } : null;
    }
    case "livrable.delete":
      return deliverableId ? { type, livrableId: deliverableId } : null;
    case "link.auto-expire":
      return deliverableId && typeof body.autoExpire === "boolean" ? { type, deliverableId, autoExpire: body.autoExpire } : null;
    case "trash.restore":
      return itemId ? { type, itemId } : null;
    case "trash.purge":
      return { type, itemId };
    case "trash.purge-expired":
      return { type };
  }
}

/** The screens a page sends: each a Figma screen id and the stored file of its copy; null when malformed. */
function readScreens(body: Data): Screens | null {
  const list = body.screens;
  if (!Array.isArray(list) || !list.length || list.length > maxScreens || typeof body.receipt !== "string" || body.receipt.length > 128_000) return null;
  const picked = list.map((item) => {
    const entry = item && typeof item === "object" ? (item as Data) : {};
    const screenId = typeof entry.id === "string" && /^[\w:;-]{1,100}$/.test(entry.id) ? entry.id : null;
    const href = fileHref(entry.fileData);
    return screenId && href ? { id: screenId, fileData: href } : null;
  });
  if (picked.some((item) => !item) || new Set(picked.map((item) => item!.id)).size !== picked.length) return null;
  return { picked: picked as Screens["picked"], receipt: body.receipt, columns: readColumns(body.columns) };
}

// ——— Turning an action into changes ———

/** The id the page chose when the table has no such record yet, else a new one. */
async function freeId(db: Db, table: typeof clients | typeof projects | typeof deliverables, org: string, wanted: number | undefined) {
  const candidates = [...(wanted ? [wanted] : []), ...Array.from({ length: 10 }, (_, index) => Date.now() + index)];
  const used = new Set((await db.select({ id: table.id }).from(table).where(and(eq(table.organizationId, org), inArray(table.id, candidates)))).map((row) => row.id));
  return candidates.find((candidate) => !used.has(candidate))!;
}

/** The deliverable dates shown on cards ("14 oct. 2026, 10:05"). */
const importedNow = () => new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

type Snapshot = {
  clients: Entity[];
  projects: Entity[];
  deliverables: Entity[];
  comments: Entity[];
  proposalStates: Record<string, unknown>;
  proposalDecisions: Record<string, unknown>;
  proposalVersions: Record<string, unknown>;
  adaptationRequests: Record<string, unknown>;
  reviewLinks: Record<string, unknown>;
};

const listOf = (state: SharedState, key: "clients" | "projects" | "deliverables" | "comments" | "trash") => (state[key] ?? []) as Entity[];
const projectOf = (record: Entity) => (record.projectId as number | undefined) ?? 1;
const clientOf = (project: Entity) => (project.clientId as number | undefined) ?? 1;

/** Every version of the deliverable `livrableId` belongs to (same project, same name), latest first. */
function versionsOf(state: SharedState, livrableId: number) {
  const records = listOf(state, "deliverables");
  const root = records.find((record) => record.id === livrableId);
  if (!root) return [];
  return records.filter((record) => projectOf(record) === projectOf(root) && record.name === root.name).sort((left, right) => Number(right.version) - Number(left.version));
}

/** Takes versions out with their requests, quotes and client links; returns what was taken. */
function takeRecords(state: SharedState, changes: StateChanges, recordIds: Set<number>): Omit<Snapshot, "clients" | "projects"> {
  const taken = listOf(state, "comments").filter((comment) => recordIds.has((comment.deliverableId as number | undefined) ?? -1));
  const commentKeys = new Set(taken.map((comment) => String(comment.id)));
  const pick = (map: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => commentKeys.has(key)));
  const links = Object.fromEntries(Object.entries(state.reviewLinks ?? {}).filter(([, link]) => recordIds.has(((link as Data)?.deliverableId as number | undefined) ?? -1)));
  const snapshot = {
    deliverables: listOf(state, "deliverables").filter((record) => recordIds.has(record.id)),
    comments: taken,
    proposalStates: pick(state.proposalStates),
    proposalDecisions: pick(state.proposalDecisions),
    proposalVersions: pick(state.proposalVersions),
    adaptationRequests: pick(state.adaptationRequests),
    reviewLinks: links,
  };
  changes.lists.deliverables = { upsert: [], remove: [...recordIds] };
  changes.lists.comments = { upsert: [], remove: taken.map((comment) => comment.id) };
  for (const map of ["proposalStates", "proposalDecisions", "proposalVersions", "adaptationRequests"] as const) {
    const keys = Object.keys(snapshot[map]);
    if (keys.length) changes.maps[map] = { upsert: {}, remove: keys };
  }
  if (Object.keys(links).length) changes.maps.reviewLinks = { upsert: {}, remove: Object.keys(links) };
  return snapshot;
}

function putInTrash(changes: StateChanges, kind: "space" | "project" | "livrable", name: string, origin: string | undefined, data: Snapshot) {
  const now = Date.now();
  changes.lists.trash = { upsert: [{ id: now, kind, name, ...(origin ? { origin } : {}), deletedAt: now, data }], remove: [] };
}

const upsert = (changes: StateChanges, list: "clients" | "projects" | "deliverables", records: Entity[]) => {
  changes.lists[list] = { upsert: records as ListChange["upsert"], remove: changes.lists[list]?.remove ?? [] };
};

/** Changes for the action, and the id it created or touched. */
/** `memberId`: who acts, whose Figma account reads a « Figma » file (src/db/figmaConnection.ts). */
export async function workspaceChanges(db: Db, org: string, actor: string, action: WorkspaceAction, memberId = ""): Promise<{ changes: StateChanges; id?: number } | Refusal> {
  const changes = noChanges();
  const { state: stored } = await readState(db, org);
  const state: SharedState = stored ?? ({} as SharedState);
  const spaces = listOf(state, "clients");
  const projectList = listOf(state, "projects");
  const records = listOf(state, "deliverables");
  const log = trail(actor, null);
  const space = (spaceId: number) => spaces.find((candidate) => candidate.id === spaceId);
  const project = (projectId: number) => projectList.find((candidate) => candidate.id === projectId);

  switch (action.type) {
    case "space.create": {
      const spaceId = await freeId(db, clients, org, action.id);
      upsert(changes, "clients", [{ id: spaceId, name: action.name, email: action.email ?? "" }]);
      return { changes, id: spaceId };
    }
    case "space.rename": {
      const target = space(action.spaceId);
      if (!target) return refused("Espace introuvable.", 404);
      upsert(changes, "clients", [{ ...target, name: action.name }]);
      // Projects keep a copy of their space's name (used by the proof export).
      upsert(changes, "projects", projectList.filter((candidate) => clientOf(candidate) === target.id).map((candidate) => ({ ...candidate, client: action.name })));
      return { changes, id: target.id };
    }
    case "space.delete": {
      const target = space(action.spaceId);
      if (!target) return refused("Espace introuvable.", 404);
      const spaceProjects = projectList.filter((candidate) => clientOf(candidate) === target.id);
      const projectIds = new Set(spaceProjects.map((candidate) => candidate.id));
      const taken = takeRecords(state, changes, new Set(records.filter((record) => projectIds.has(projectOf(record))).map((record) => record.id)));
      changes.lists.projects = { upsert: [], remove: [...projectIds] };
      changes.lists.clients = { upsert: [], remove: [target.id] };
      putInTrash(changes, "space", String(target.name), undefined, { ...taken, clients: [target], projects: spaceProjects });
      log.add("space.deleted", `Espace « ${target.name} » placé dans la corbeille`);
      break;
    }
    case "project.create": {
      const target = space(action.clientId);
      if (!target) return refused("Espace introuvable.", 404);
      const projectId = await freeId(db, projects, org, action.id);
      upsert(changes, "projects", [{ id: projectId, name: action.name, client: target.name, clientId: target.id, status: "Brouillon" }]);
      return { changes, id: projectId };
    }
    case "project.rename":
    case "project.move": {
      const target = project(action.projectId);
      if (!target) return refused("Projet introuvable.", 404);
      if (action.type === "project.rename") upsert(changes, "projects", [{ ...target, name: action.name }]);
      else {
        const destination = space(action.clientId);
        if (!destination) return refused("Espace introuvable.", 404);
        upsert(changes, "projects", [{ ...target, clientId: destination.id, client: destination.name }]);
      }
      return { changes, id: target.id };
    }
    case "project.delete": {
      const target = project(action.projectId);
      if (!target) return refused("Projet introuvable.", 404);
      const taken = takeRecords(state, changes, new Set(records.filter((record) => projectOf(record) === target.id).map((record) => record.id)));
      changes.lists.projects = { upsert: [], remove: [target.id] };
      putInTrash(changes, "project", String(target.name), space(clientOf(target))?.name as string | undefined, { ...taken, clients: [], projects: [target] });
      log.add("project.deleted", `Projet « ${target.name} » placé dans la corbeille`);
      break;
    }
    case "livrable.create": {
      if (!project(action.projectId)) return refused("Projet introuvable.", 404);
      const undeployed = action.kind === "Link" && action.url ? undeployedSiteProblem(action.url) : null;
      if (undeployed) return refused(undeployed, 400);
      const fileKey = figmaFileKey(action.url ?? "");
      // A « Figma »'s pages as the server read them for the dialog, signed: Figma is not asked again.
      const tree = action.figma && fileKey ? readFigmaReceipt(action.figma.receipt, org, fileKey) : null;
      if (action.figma && !tree) return refused("La lecture du fichier Figma a expiré : rouvrez « Nouveau livrable » et collez le lien à nouveau.", 400);
      const round = action.figma && fileKey && tree ? await figmaRound(db, org, memberId, fileKey, tree, action.figma) : null;
      if (round && !("fileKey" in round)) return round;
      const copied = action.screens && fileKey ? await storedScreens(db, org, fileKey, action.screens) : null;
      if (copied && !("screens" in copied)) return copied;
      const files = [action.fileData, action.coverData].filter((href): href is string => Boolean(href));
      if (!(await ownFiles(db, org, files))) return refused("Fichier introuvable.", 404);
      const recordId = await freeId(db, deliverables, org, action.id);
      upsert(changes, "deliverables", [
        {
          id: recordId,
          projectId: action.projectId,
          name: action.name,
          type: action.kind,
          size: action.size,
          version: 1,
          status: "En attente client",
          importedAt: importedNow(),
          locked: false,
          ...(action.fileData ? { fileData: action.fileData } : {}),
          ...(action.url ? { url: action.kind === "Link" ? withoutToolbarFlag(action.url) : action.url } : {}),
          ...(round ? { url: figmaFileUrl(round.fileKey), figma: round } : {}),
          ...(copied && fileKey ? { url: figmaFileUrl(fileKey), figmaFile: { fileKey, fileName: copied.fileName }, screens: copied.screens, columns: action.screens!.columns } : {}),
          ...(action.coverData ? { coverData: action.coverData } : {}),
          ...(action.duration ? { duration: action.duration } : {}),
        },
      ]);
      if (round) ownRound(state, changes, recordId, memberId);
      return { changes, id: recordId };
    }
    case "version.import": {
      const versions = versionsOf(state, action.livrableId);
      if (!versions[0]) return refused("Livrable introuvable.", 404);
      // A « Figma » or « Écrans Figma » stays one: its versions are rounds of the same Figma file.
      const figmaKinds = new Set(["Figma", "Screens"]);
      if ((figmaKinds.has(String(versions[0].type)) || figmaKinds.has(action.kind)) && versions[0].type !== action.kind) return refused("Une version est de la nature de son livrable.", 400);
      const previousFile = versions[0].figmaFile as { fileKey: string } | undefined;
      const copied = action.screens && previousFile ? await storedScreens(db, org, previousFile.fileKey, action.screens) : null;
      if (action.screens && !copied) return refused("Livrable introuvable.", 404);
      if (copied && !("screens" in copied)) return copied;
      const previousRound = versions[0].figma as FigmaRound | undefined;
      // Its pages are the ones read for the deliverable: a round reads only the file's history.
      const round = action.figma && previousRound ? await figmaRound(db, org, memberId, previousRound.fileKey, { name: previousRound.fileName, pages: previousRound.pages }, action.figma) : null;
      if (action.figma && !round) return refused("Livrable introuvable.", 404);
      if (round && !("fileKey" in round)) return round;
      if (round && round.version.id === previousRound?.version.id)
        return refused(`« ${round.version.label} » est déjà la version de la tournée en cours. Enregistrez la nouvelle dans Figma.`, 400);
      if (action.fileData && !(await ownFiles(db, org, [action.fileData]))) return refused("Fichier introuvable.", 404);
      const undeployed = action.url ? undeployedSiteProblem(action.url) : null;
      if (undeployed) return refused(undeployed, 400);
      const recordId = await freeId(db, deliverables, org, action.id);
      const created = {
        id: recordId,
        projectId: projectOf(versions[0]),
        name: versions[0].name,
        type: action.kind,
        size: action.size,
        version: Number(versions[0].version) + 1,
        status: "En attente client",
        importedAt: importedNow(),
        locked: false,
        ...(action.fileData ? { fileData: action.fileData } : {}),
        ...(action.url ? { url: withoutToolbarFlag(action.url) } : {}),
        ...(round ? { url: figmaFileUrl(round.fileKey), figma: round } : {}),
        ...(copied && previousFile ? { url: figmaFileUrl(previousFile.fileKey), figmaFile: { fileKey: previousFile.fileKey, fileName: copied.fileName }, screens: copied.screens, columns: action.screens!.columns } : {}),
        ...(action.duration ? { duration: action.duration } : {}),
      };
      // The earlier versions are frozen: the client reviews the new one.
      upsert(changes, "deliverables", [created, ...versions.map((record) => ({ ...record, status: "Remplacée", locked: true }))]);
      if (round) ownRound(state, changes, recordId, memberId);
      return { changes, id: recordId };
    }
    case "livrable.rename":
    case "livrable.move": {
      const versions = versionsOf(state, action.livrableId);
      if (!versions[0]) return refused("Livrable introuvable.", 404);
      const ids = new Set(versions.map((record) => record.id));
      const targetProject = action.type === "livrable.move" ? action.projectId : projectOf(versions[0]);
      const targetName = action.type === "livrable.rename" ? action.name : String(versions[0].name);
      if (action.type === "livrable.move" && !project(action.projectId)) return refused("Projet introuvable.", 404);
      const clash = records.some(
        (record) => !ids.has(record.id) && projectOf(record) === targetProject && String(record.name).toLowerCase() === targetName.toLowerCase(),
      );
      if (clash) return refused("Un autre livrable porte déjà ce nom dans ce projet.");
      upsert(changes, "deliverables", versions.map((record) => ({ ...record, name: targetName, projectId: targetProject })));
      return { changes, id: action.livrableId };
    }
    case "livrable.delete": {
      const versions = versionsOf(state, action.livrableId);
      if (!versions[0]) return refused("Livrable introuvable.", 404);
      const parent = project(projectOf(versions[0]));
      const origin = parent ? [space(clientOf(parent))?.name, parent.name].filter(Boolean).join(" / ") : undefined;
      const taken = takeRecords(state, changes, new Set(versions.map((record) => record.id)));
      putInTrash(changes, "livrable", String(versions[0].name), origin, { ...taken, clients: [], projects: [] });
      break;
    }
    case "link.auto-expire": {
      const record = records.find((candidate) => candidate.id === action.deliverableId);
      const key = record ? `${record.id}:${record.version}` : "";
      const link = (state.reviewLinks ?? {})[key] as Data | undefined;
      if (!link) return refused("Lien introuvable.", 404);
      changes.maps.reviewLinks = { upsert: { [key]: { ...link, autoExpire: action.autoExpire } }, remove: [] };
      return { changes, id: action.deliverableId };
    }
    case "trash.restore": {
      const item = listOf(state, "trash").find((candidate) => candidate.id === action.itemId);
      if (!item) return refused("Élément introuvable dans la corbeille.", 404);
      const data = (item.data ?? {}) as Partial<Snapshot>;
      // Merged by id: a partial restore never duplicates, and what exists now wins.
      const missing = (list: Entity[], back: Entity[] | undefined) => (back ?? []).filter((entry) => !list.some((other) => other.id === entry.id));
      for (const list of ["clients", "projects", "deliverables", "comments"] as const) {
        const back = missing(listOf(state, list), data[list]);
        if (back.length) changes.lists[list] = { upsert: back as ListChange["upsert"], remove: [] };
      }
      for (const map of ["proposalStates", "proposalDecisions", "proposalVersions", "adaptationRequests", "reviewLinks"] as const) {
        const current = (state[map] ?? {}) as Record<string, unknown>;
        const back = Object.fromEntries(Object.entries(data[map] ?? {}).filter(([key]) => !(key in current)));
        if (Object.keys(back).length) changes.maps[map] = { upsert: back, remove: [] };
      }
      changes.lists.trash = { upsert: [], remove: [item.id] };
      log.add("trash.restored", `« ${item.name} » restauré depuis la corbeille`);
      break;
    }
    case "trash.purge":
    case "trash.purge-expired": {
      const limit = Date.now() - trashDays * 24 * 60 * 60 * 1000;
      const items = listOf(state, "trash").filter((item) =>
        action.type === "trash.purge-expired" ? Number(item.deletedAt) < limit : action.itemId === undefined || item.id === action.itemId,
      );
      if (action.type === "trash.purge" && action.itemId !== undefined && !items.length) return refused("Élément introuvable dans la corbeille.", 404);
      if (items.length) changes.lists.trash = { upsert: [], remove: items.map((item) => item.id) };
      break;
    }
  }
  log.into(changes);
  return { changes };
}

/**
 * The screens of an « Écrans Figma » version: copies the agency stored itself (src/db/figmaScreens.ts), each in
 * one of Figma's formats, named and sized as the server read them (the receipt), never as the page says.
 */
async function storedScreens(db: Db, org: string, fileKey: string, screens: Screens): Promise<{ fileName: string; screens: StoredScreen[] } | Refusal> {
  const read = readFigmaScreensReceipt(screens.receipt, org, fileKey);
  if (!read) return refused("La lecture du fichier Figma a expiré : rouvrez la fenêtre et choisissez les écrans à nouveau.", 400);
  const hrefs = screens.picked.map((item) => item.fileData);
  const files = await db
    .select({ id: storedFiles.id, mimeType: storedFiles.mimeType })
    .from(storedFiles)
    .where(and(eq(storedFiles.organizationId, org), inArray(storedFiles.id, hrefs.map((href) => href.split("/").at(-1)!))));
  const mimeOf = new Map(files.map((file) => [`/api/files/${file.id}`, file.mimeType]));
  if (files.length !== new Set(hrefs).size) return refused("Fichier introuvable.", 404);
  // One of Figma's four formats each, mixed as the agency chose (src/lib/figmaScreens.ts).
  const known = new Set(Object.values(screenFormats).map((format) => format.mimeType as string));
  if (hrefs.some((href) => !known.has(mimeOf.get(href) ?? ""))) return refused("Un écran n’est pas une image ou un PDF copié depuis Figma.", 400);
  const result: StoredScreen[] = [];
  for (const item of screens.picked) {
    const screen = read.screens.find((candidate) => candidate.id === item.id);
    if (!screen) return refused("Un écran choisi n’est pas dans le fichier Figma lu par Kora.", 400);
    result.push({ ...screen, fileData: item.fileData, mimeType: mimeOf.get(item.fileData)! });
  }
  return { fileName: read.name, screens: result };
}

/** The round's comments are read with its maker's Figma account (src/db/figmaImport.ts): an agency setting, never the client's. */
function ownRound(state: SharedState, changes: StateChanges, recordId: number, memberId: string) {
  const imports = { ...((state.figmaImports ?? {}) as FigmaImports) };
  imports[String(recordId)] = { ...imports[String(recordId)], ownerId: memberId };
  changes.settings.upsert.figmaImports = imports;
}

/**
 * A round of a « Figma » deliverable: the pages chosen must be the file's (`tree`, as the server read it),
 * and the version one saved in its history, read from Figma now. Nothing the page says of the file (its
 * name, its pages' names) is kept.
 */
async function figmaRound(db: Db, org: string, memberId: string, fileKey: string, tree: FigmaFileTree, choice: FigmaChoice): Promise<FigmaRound | Refusal> {
  const loaded = await loadFigmaVersions(db, org, memberId, fileKey);
  if (!loaded.ok) return refused(loaded.error, loaded.status);
  const version = loaded.versions.find((candidate) => candidate.id === choice.versionId);
  if (!version) return refused("Cette version n’est pas dans l’historique du fichier Figma. Enregistrez-la dans Figma, puis choisissez-la.", 400);
  const known = new Set(tree.pages.map((page) => page.id));
  if (!choice.pages.every((page) => known.has(page))) return refused("Une page choisie n’est pas dans le fichier Figma lu par Kora.", 400);
  return { fileKey, fileName: tree.name, pages: tree.pages, reviewed: choice.pages, version };
}

/** Files the agency imported itself (src/lib/storage.ts): a page cannot point at another's. */
async function ownFiles(db: Db, org: string, hrefs: string[]) {
  if (!hrefs.length) return true;
  const fileIds = hrefs.map((href) => href.split("/").at(-1)!);
  const found = await db.select({ id: storedFiles.id }).from(storedFiles).where(and(eq(storedFiles.organizationId, org), inArray(storedFiles.id, fileIds)));
  return found.length === new Set(fileIds).size;
}
