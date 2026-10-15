// Shape of the state shared by the agency and client pages, and the changes sent to the server.
// Used on both sides: the browser computes the changes, the server applies them (src/db/state.ts).
//
// Pages only send what changed since the last sync, record by record, so two pages editing different
// records never overwrite each other; on the same record the last write wins.

/** Lists of records with a numeric id; their order is kept. */
export const listCollections = ["clients", "projects", "deliverables", "comments", "notifications", "auditEvents", "trash"] as const;
/** Records keyed by a string (review links) or a comment id (proposals). */
export const mapCollections = ["reviewLinks", "proposalStates", "proposalDecisions", "adaptationRequests", "proposalVersions"] as const;
/** Single values. */
export const settingKeys = ["reviewLink"] as const;

export type ListCollection = (typeof listCollections)[number];
export type MapCollection = (typeof mapCollections)[number];
export type SettingKey = (typeof settingKeys)[number];

type Entity = { id: number } & Record<string, unknown>;

export type SharedState = Partial<Record<ListCollection, Entity[]>> &
  Partial<Record<MapCollection, Record<string, unknown>>> &
  Partial<Record<SettingKey, unknown>>;

export type ListChange = { upsert: Entity[]; remove: number[]; order?: number[] };
export type MapChange = { upsert: Record<string, unknown>; remove: string[] };

export type StateChanges = {
  lists: Partial<Record<ListCollection, ListChange>>;
  maps: Partial<Record<MapCollection, MapChange>>;
  settings: { upsert: Partial<Record<SettingKey, unknown>>; remove: SettingKey[] };
};

/** JSON with sorted keys: Postgres returns object keys in its own order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Same JSON value, whatever the order of object keys. */
export const sameValue = (left: unknown, right: unknown) => stable(left) === stable(right);
const same = sameValue;

function listOf(state: SharedState | null, collection: ListCollection): Entity[] {
  const value = state?.[collection];
  return Array.isArray(value) ? value.filter((entity) => typeof entity?.id === "number") : [];
}

function mapOf(state: SharedState | null, collection: MapCollection): Record<string, unknown> {
  const value = state?.[collection];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** What changed from `previous` (last synced state, null = nothing synced yet) to `next`; null if nothing. */
export function diffState(previous: SharedState | null, next: SharedState): StateChanges | null {
  const changes: StateChanges = { lists: {}, maps: {}, settings: { upsert: {}, remove: [] } };
  let changed = false;

  for (const collection of listCollections) {
    if (!(collection in next)) continue;
    const before = new Map(listOf(previous, collection).map((entity) => [entity.id, entity]));
    const after = listOf(next, collection);
    const upsert = after.filter((entity) => !before.has(entity.id) || !same(before.get(entity.id), entity));
    const kept = new Set(after.map((entity) => entity.id));
    const remove = [...before.keys()].filter((id) => !kept.has(id));
    const order = after.map((entity) => entity.id);
    const reordered = !same([...before.keys()], order);
    if (!upsert.length && !remove.length && !reordered) continue;
    changes.lists[collection] = { upsert, remove, order };
    changed = true;
  }

  for (const collection of mapCollections) {
    if (!(collection in next)) continue;
    const before = mapOf(previous, collection);
    const after = mapOf(next, collection);
    const upsert = Object.fromEntries(Object.entries(after).filter(([key, value]) => !same(before[key], value)));
    const remove = Object.keys(before).filter((key) => !(key in after));
    if (!Object.keys(upsert).length && !remove.length) continue;
    changes.maps[collection] = { upsert, remove };
    changed = true;
  }

  for (const key of settingKeys) {
    if (!(key in next)) continue;
    const before = previous?.[key] ?? null;
    const after = next[key] ?? null;
    if (same(before, after)) continue;
    if (after === null) changes.settings.remove.push(key);
    else changes.settings.upsert[key] = after;
    changed = true;
  }

  return changed ? changes : null;
}
