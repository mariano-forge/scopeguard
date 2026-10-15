import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseConfig } from "./config";
import * as schema from "./schema";

function createDb() {
  const { url, ssl } = databaseConfig();
  const pool = new Pool({ connectionString: url, ssl, max: 5 });
  return drizzle(pool, { schema });
}

// One pool per server process: `next dev` reloads modules, so it is kept on globalThis.
const globalForDb = globalThis as unknown as { koraDb?: ReturnType<typeof createDb> };

export function getDb() {
  globalForDb.koraDb ??= createDb();
  return globalForDb.koraDb;
}

export type Db = ReturnType<typeof getDb>;
