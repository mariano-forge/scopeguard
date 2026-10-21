// Request limits per person and action, counted in the database (shared by every server instance).
// A fixed window: the first request opens it, the count starts again once it has passed.

import { sql } from "drizzle-orm";
import type { Db } from "./client";

const limit = (variable: string, fallback: number) => Math.max(1, Number(process.env[variable]) || fallback);

/** The limits, adjustable per environment (tests lower them). */
export const requestLimit = {
  /** Files an agency member may import per hour. */
  uploads: () => ({ max: limit("UPLOADS_PER_HOUR", 200), seconds: 3600 }),
  /** Saves a page may send per minute (agency state, client review). */
  writes: () => ({ max: limit("WRITES_PER_MINUTE", 600), seconds: 60 }),
  /** Invitation requests (each may hold several addresses) per hour: mails go out. */
  invitations: () => ({ max: limit("INVITATIONS_PER_HOUR", 60), seconds: 3600 }),
  /** Code requests on review links, per address: each one says whether an address is invited. */
  accessCodes: () => ({ max: limit("ACCESS_CODES_PER_HOUR", 30), seconds: 3600 }),
  /** Demo requests from the public landing page, per address: a mail goes out, from anyone. */
  demo: () => ({ max: limit("DEMO_REQUESTS_PER_HOUR", 5), seconds: 3600 }),
};

/** Counts one request under `key`; false once `max` were made in the current window. */
export async function withinLimit(db: Db, key: string, { max, seconds }: { max: number; seconds: number }) {
  const result = await db.execute<{ count: number }>(sql`
    insert into request_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when request_limits.window_start < now() - make_interval(secs => ${seconds}) then 1 else request_limits.count + 1 end,
      window_start = case when request_limits.window_start < now() - make_interval(secs => ${seconds}) then now() else request_limits.window_start end
    returning count`);
  return Number(result.rows[0]?.count ?? 0) <= max;
}

export const tooManyRequests = () => Response.json({ error: "Trop de requêtes. Patientez un moment avant de réessayer." }, { status: 429 });
