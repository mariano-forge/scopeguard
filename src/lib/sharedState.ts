// Shape of the state shared by the agency and client pages, and of the changes the server applies to
// it (src/db/state.ts). Pages read the state; the changes are built on the server by the action
// routes (src/db/agencyActions.ts, workspaceActions.ts, reviewActions.ts), record by record.

/** Lists of records with a numeric id; their order is kept. */
export const listCollections = ["clients", "projects", "deliverables", "comments", "notifications", "auditEvents", "trash"] as const;
/** Records keyed by a string (review links) or a comment id (proposals). */
export const mapCollections = ["reviewLinks", "proposalStates", "proposalDecisions", "adaptationRequests", "proposalVersions"] as const;
/** Single values. */
export const settingKeys = ["reviewLink", "siteSeen", "figmaTeam", "figmaImports"] as const;

export type ListCollection = (typeof listCollections)[number];
export type MapCollection = (typeof mapCollections)[number];
export type SettingKey = (typeof settingKeys)[number];

export type Entity = { id: number } & Record<string, unknown>;

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
