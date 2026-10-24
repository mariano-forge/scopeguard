// URL scheme of the agency workspace. Ids (not names) keep links stable when things are renamed.
//
//   /                                              home
//   /a-traiter                                     pending decisions across all projects
//   /recents                                       recently opened projects and deliverables
//   /partages                                      shared with me
//   /corbeille                                     deleted items (restorable for 30 days)
//   /espaces                                       all client spaces
//   /espaces/:clientId                             projects of a client space
//   /projets/:projectId                            deliverables of a project
//   /projets/:projectId/perimetre                  its reference scope (src/lib/projectScope.ts)
//   /projets/:projectId/suivi                      its tracking: figures and charts from its scope and requests
//   /projets/:projectId/livrables/:livrableId      latest version of a deliverable
//   /projets/:projectId/livrables/:livrableId/versions/:version
//   /projets/:projectId/livrables/:livrableId/tableau-de-bord   (old) redirects to the home analytics filtered on it
//   /projets/:projectId/livrables/:livrableId/propositions      (old) opens the deliverable
//   ?demande=:commentId on a deliverable URL focuses that comment

export type AgencyView =
  | { kind: "home" }
  | { kind: "todo" }
  | { kind: "recents" }
  | { kind: "shared" }
  | { kind: "trash" }
  | { kind: "spaces" }
  | { kind: "client"; clientId: number }
  | { kind: "project"; projectId: number }
  | { kind: "scope"; projectId: number }
  | { kind: "tracking"; projectId: number }
  | { kind: "dashboard"; projectId: number; livrableId: number }
  | { kind: "deliverable"; projectId: number; livrableId: number; version?: number }
  | { kind: "not-found" };

const id = (value: string | undefined) => (value && /^\d+$/.test(value) ? Number(value) : null);

export function parseAgencyPath(pathname: string): AgencyView {
  const [first, second, third, fourth, fifth, sixth, extra] = pathname.split("/").filter(Boolean);
  if (!first) return { kind: "home" };
  if (first === "a-traiter" && !second) return { kind: "todo" };
  if (first === "recents" && !second) return { kind: "recents" };
  if (first === "partages" && !second) return { kind: "shared" };
  if (first === "corbeille" && !second) return { kind: "trash" };

  if (first === "espaces") {
    if (!second) return { kind: "spaces" };
    const clientId = id(second);
    return clientId !== null && !third ? { kind: "client", clientId } : { kind: "not-found" };
  }

  if (first === "projets") {
    const projectId = id(second);
    if (projectId === null) return { kind: "not-found" };
    if (!third) return { kind: "project", projectId };
    if (third === "perimetre" && !fourth) return { kind: "scope", projectId };
    if (third === "suivi" && !fourth) return { kind: "tracking", projectId };
    const livrableId = id(fourth);
    if (third === "livrables" && livrableId !== null) {
      if (!fifth) return { kind: "deliverable", projectId, livrableId };
      if (fifth === "tableau-de-bord" && !sixth) return { kind: "dashboard", projectId, livrableId };
      // Removed pages: old links open the deliverable.
      if (fifth === "propositions" && !sixth) return { kind: "dashboard", projectId, livrableId };
      const version = id(sixth);
      if (fifth === "versions" && version !== null && !extra)
        return { kind: "deliverable", projectId, livrableId, version };
    }
  }

  return { kind: "not-found" };
}

export const href = {
  home: () => "/",
  todo: () => "/a-traiter",
  recents: () => "/recents",
  shared: () => "/partages",
  trash: () => "/corbeille",
  spaces: () => "/espaces",
  /** A client space ("espace"). */
  client: (clientId: number) => `/espaces/${clientId}`,
  project: (projectId: number) => `/projets/${projectId}`,
  scope: (projectId: number) => `/projets/${projectId}/perimetre`,
  tracking: (projectId: number) => `/projets/${projectId}/suivi`,
  dashboard: (projectId: number, livrableId: number) => `/projets/${projectId}/livrables/${livrableId}/tableau-de-bord`,
  deliverable: (projectId: number, livrableId: number, version?: number) =>
    `/projets/${projectId}/livrables/${livrableId}${version ? `/versions/${version}` : ""}`,
};

// A deliverable ("livrable") is the group of version records sharing a project and a name.
// Its stable id is the id of its oldest record.
type VersionRecord = { id: number; projectId?: number; name: string; version: number };

export function livrableIdOf<T extends VersionRecord>(record: T, records: T[]) {
  return Math.min(
    ...records
      .filter((other) => (other.projectId ?? 1) === (record.projectId ?? 1) && other.name === record.name)
      .map((other) => other.id),
  );
}

export function versionsOfLivrable<T extends VersionRecord>(livrableId: number, records: T[]) {
  const root = records.find((record) => record.id === livrableId);
  if (!root) return [];
  return records
    .filter((record) => (record.projectId ?? 1) === (root.projectId ?? 1) && record.name === root.name)
    .sort((left, right) => right.version - left.version);
}

/** URL of a given version record: the latest version gets the short form. */
export function hrefForRecord<T extends VersionRecord>(record: T, records: T[]) {
  const livrableId = livrableIdOf(record, records);
  const latest = versionsOfLivrable(livrableId, records)[0];
  return href.deliverable(record.projectId ?? 1, livrableId, latest?.id === record.id ? undefined : record.version);
}

/**
 * Where an "Activité" notification of the bell leads: its version, on its request (?demande=) or
 * with « Partager la revue » open (?partage=1). None when it has no target (older notifications) or
 * its version is gone.
 */
export function notificationHref<T extends VersionRecord>(
  notification: { deliverableId?: number; commentId?: number; open?: string },
  records: T[],
  commentIds: Set<number>,
) {
  const record = records.find((candidate) => candidate.id === notification.deliverableId);
  if (!record) return undefined;
  const target = hrefForRecord(record, records);
  if (notification.open === "share") return `${target}?partage=1`;
  return notification.commentId !== undefined && commentIds.has(notification.commentId) ? `${target}?demande=${notification.commentId}` : target;
}
