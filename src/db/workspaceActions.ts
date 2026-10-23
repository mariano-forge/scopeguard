// How the agency organises its work, one action at a time (routes under /api/spaces, /api/projects,
// /api/deliverables and /api/trash): spaces, projects, deliverables and their versions, the trash.
// Built from what the database holds; run by runAgencyAction (agencyActions.ts), which applies the
// members' reserved actions (deleting a space or a project, emptying the trash).

import { and, eq, inArray } from "drizzle-orm";
import { readVideoDuration } from "@/lib/timecode";
import type { Entity, ListChange, SharedState, StateChanges } from "@/lib/sharedState";
import { undeployedSiteProblem, withoutToolbarFlag } from "@/lib/siteReview";
import { id, noChanges, text, trail, type Data } from "./actions";
import type { Db } from "./client";
import { clients, deliverables, projects, storedFiles } from "./schema";
import { readState } from "./state";

const deliverableTypes = ["PDF", "Image", "Video", "Link", "Doc"] as const;
type DeliverableType = (typeof deliverableTypes)[number];
/** Items stay restorable this long; then an administrator's page has them purged. */
export const trashDays = 30;

/** `duration`: a video's length in seconds, read by the agency's browser; its files' links last that long (src/lib/storage.ts). */
type NewFile = { kind: DeliverableType; size: number; fileData?: string; duration?: number };

export type WorkspaceAction =
  | { type: "space.create"; id?: number; name: string; email?: string }
  | { type: "space.rename"; spaceId: number; name: string }
  | { type: "space.delete"; spaceId: number }
  | { type: "project.create"; id?: number; clientId: number; name: string }
  | { type: "project.rename"; projectId: number; name: string }
  | { type: "project.move"; projectId: number; clientId: number }
  | { type: "project.delete"; projectId: number }
  | ({ type: "livrable.create"; id?: number; projectId: number; name: string; url?: string; coverData?: string } & NewFile)
  // A version is of its deliverable's nature: a « Lien » by its address, any other kind by its file.
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
      // No new « Document » (22 October 2026): those already imported keep their versions.
      if (!target || !name || !kind || kind === "Doc") return null;
      if ((body.fileData !== undefined && !fileHref(body.fileData)) || (body.coverData !== undefined && !fileHref(body.coverData))) return null;
      if (body.url !== undefined && !webAddress(body.url)) return null;
      const duration = kind === "Video" ? readVideoDuration(body.duration) : undefined;
      return { type, id: id(body.id), projectId: target, name, kind, size: size(body.size), fileData: fileHref(body.fileData), url: webAddress(body.url), coverData: fileHref(body.coverData), duration };
    }
    case "version.import": {
      const kind = deliverableType(body.type);
      const fileData = fileHref(body.fileData);
      const url = webAddress(body.url);
      if (!deliverableId || !kind) return null;
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
export async function workspaceChanges(db: Db, org: string, actor: string, action: WorkspaceAction): Promise<{ changes: StateChanges; id?: number } | Refusal> {
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
          ...(action.coverData ? { coverData: action.coverData } : {}),
          ...(action.duration ? { duration: action.duration } : {}),
        },
      ]);
      return { changes, id: recordId };
    }
    case "version.import": {
      const versions = versionsOf(state, action.livrableId);
      if (!versions[0]) return refused("Livrable introuvable.", 404);
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
        ...(action.duration ? { duration: action.duration } : {}),
      };
      // The earlier versions are frozen: the client reviews the new one.
      upsert(changes, "deliverables", [created, ...versions.map((record) => ({ ...record, status: "Remplacée", locked: true }))]);
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

/** Files the agency imported itself (src/lib/storage.ts): a page cannot point at another's. */
async function ownFiles(db: Db, org: string, hrefs: string[]) {
  if (!hrefs.length) return true;
  const fileIds = hrefs.map((href) => href.split("/").at(-1)!);
  const found = await db.select({ id: storedFiles.id }).from(storedFiles).where(and(eq(storedFiles.organizationId, org), inArray(storedFiles.id, fileIds)));
  return found.length === new Set(fileIds).size;
}
