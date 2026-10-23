// A local stand-in for Figma's web API (US-054), started by global-setup.ts for the whole run: Kora's
// server reaches it through FIGMA_API_URL (playwright.config.ts) and never reaches Figma.
//
// Figma's consent page is not served here: the browser goes to FIGMA_OAUTH_URL, which the tests intercept
// (page.route) to come straight back with a code. The code says what this stand-in answers:
// "ok:<handle>:<PKCE challenge>" gives tokens for a Figma account named <handle>, only to the verifier
// matching that challenge and only once; anything else is refused, as Figma refuses an unknown code.
//
// Files: every key is a file named "Maquette <key>", with three pages and its history (figmaStandInFile).
// A key starting with "Absent" is a file the account cannot open; "Unsaved" one with no named version;
// "Limited" one whose pages Figma refuses to read again for days (a View or Collab seat's 20 reads a
// month); "Shallow" one whose pages are read but not its screens. The stand-in counts the reads of each
// file: GET /__test/reads/<key> (figmaReads).
//
// Each page has one screen at its top (figmaStandInFile.frames). A file has no comments until a test gives
// it some: PUT /__test/comments/<key> with Figma's own shape (setFigmaComments).

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export const figmaStandInPort = 3197;
export const figmaClient = { id: "figma-test-client", secret: "figma-test-secret" };

/** What every file of the stand-in holds: its pages, and its history (latest first, an autosave between). */
export const figmaStandInFile = {
  pages: [
    { id: "0:1", name: "Accueil", type: "CANVAS" },
    { id: "0:2", name: "Contact", type: "CANVAS" },
    { id: "0:3", name: "Brouillons", type: "CANVAS" },
  ],
  /** The screen at the top of each page: Figma pins a comment on one. */
  frames: { "0:1": { id: "1:1", name: "Accueil desktop" }, "0:2": { id: "2:1", name: "Formulaire" }, "0:3": { id: "3:1", name: "Essai" } } as Record<string, { id: string; name: string }>,
  versions: [
    { id: "102", label: "V2 envoyée au client", description: "", created_at: "2026-10-22T10:00:00Z", user: { handle: "Mariano" } },
    { id: "101b", label: null, description: null, created_at: "2026-10-21T10:00:00Z", user: { handle: "Mariano" } },
    { id: "101", label: "V1 envoyée au client", description: "", created_at: "2026-10-20T09:00:00Z", user: { handle: "Mariano" } },
  ],
};

/** How often Kora's server read a file of the stand-in: its pages (Figma's tightest read) and its history. */
export async function figmaReads(key: string): Promise<{ file: number; versions: number }> {
  return (await fetch(`http://127.0.0.1:${figmaStandInPort}/__test/reads/${key}`)).json();
}

/** A comment as Figma's API gives it. */
export type StandInComment = {
  id: string;
  parent_id?: string;
  message: string;
  created_at: string;
  resolved_at?: string | null;
  user: { id: string; handle: string };
  client_meta?: { node_id?: string; node_offset?: { x: number; y: number }; x?: number; y?: number };
  order_id?: number | null;
};

/** The comments the file `key` holds from now on, as Figma would list them. */
export async function setFigmaComments(key: string, comments: StandInComment[]) {
  await fetch(`http://127.0.0.1:${figmaStandInPort}/__test/comments/${key}`, { method: "PUT", body: JSON.stringify(comments) });
}

export function startFigmaStandIn(redirectUri: string): Promise<Server> {
  const commentsOf = new Map<string, StandInComment[]>();
  const used = new Set<string>();
  const reads = new Map<string, { file: number; versions: number }>();
  const accounts = new Map<string, string>();
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const answer = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      const url = new URL(request.url ?? "/", "http://stand-in");
      const counted = /^\/__test\/reads\/([A-Za-z0-9]+)$/.exec(url.pathname);
      if (counted) return answer(200, reads.get(counted[1]) ?? { file: 0, versions: 0 });
      const given = /^\/__test\/comments\/([A-Za-z0-9]+)$/.exec(url.pathname);
      if (given && request.method === "PUT") {
        commentsOf.set(given[1], JSON.parse(raw) as StandInComment[]);
        return answer(200, {});
      }

      if (request.method === "POST" && url.pathname === "/v1/oauth/token") {
        const expected = `Basic ${Buffer.from(`${figmaClient.id}:${figmaClient.secret}`).toString("base64")}`;
        if (request.headers.authorization !== expected) return answer(401, { error: "invalid_client" });
        const form = new URLSearchParams(raw);
        const [kind, handle, challenge] = (form.get("code") ?? "").split(":");
        const verifier = form.get("code_verifier") ?? "";
        const pkce = createHash("sha256").update(verifier).digest("base64url") === challenge;
        if (form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== redirectUri || kind !== "ok" || !handle || !pkce || used.has(form.get("code")!))
          return answer(400, { error: "invalid_grant" });
        used.add(form.get("code")!);
        const accessToken = `figma-access-${handle}-${randomBytes(8).toString("hex")}`;
        accounts.set(accessToken, handle);
        return answer(200, { access_token: accessToken, refresh_token: `figma-refresh-${handle}`, expires_in: 7_776_000, token_type: "bearer", user_id_string: `fig-${handle}` });
      }

      // A new access token for a refresh token; the one it replaces stops working, as at Figma.
      if (request.method === "POST" && url.pathname === "/v1/oauth/refresh") {
        const expected = `Basic ${Buffer.from(`${figmaClient.id}:${figmaClient.secret}`).toString("base64")}`;
        const handle = /^figma-refresh-(.+)$/.exec(new URLSearchParams(raw).get("refresh_token") ?? "")?.[1];
        if (request.headers.authorization !== expected || !handle) return answer(400, { error: "invalid_grant" });
        for (const [token, owner] of accounts) if (owner === handle) accounts.delete(token);
        const accessToken = `figma-access-${handle}-${randomBytes(8).toString("hex")}`;
        accounts.set(accessToken, handle);
        return answer(200, { access_token: accessToken, expires_in: 7_776_000, token_type: "bearer" });
      }

      const handle = accounts.get((request.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!handle) return answer(403, { status: 403, err: "Invalid token" });

      if (request.method === "GET" && url.pathname === "/v1/me") return answer(200, { id: `fig-${handle}`, handle, email: `${handle}@figma.test`, img_url: "" });

      const thread = /^\/v1\/files\/([A-Za-z0-9]+)\/comments$/.exec(url.pathname);
      if (request.method === "GET" && thread) return answer(200, { comments: commentsOf.get(thread[1]) ?? [] });

      const file = /^\/v1\/files\/([A-Za-z0-9]+)(\/versions)?$/.exec(url.pathname);
      if (request.method === "GET" && file) {
        const [, key, history] = file;
        const count = reads.get(key) ?? { file: 0, versions: 0 };
        reads.set(key, { file: count.file + (history ? 0 : 1), versions: count.versions + (history ? 1 : 0) });
        if (key.startsWith("Absent")) return answer(404, { status: 404, err: "Not found" });
        // "Shallow": the pages read, then the screens refused (the limit reached in between).
        if ((key.startsWith("Limited") || (key.startsWith("Shallow") && url.searchParams.get("depth") === "2")) && !history) {
          response.writeHead(429, { "content-type": "application/json", "retry-after": "399574", "x-figma-rate-limit-type": "low", "x-figma-plan-tier": "starter" });
          return response.end(JSON.stringify({ status: 429, err: "Rate limit exceeded" }));
        }
        if (history) return answer(200, { versions: key.startsWith("Unsaved") ? figmaStandInFile.versions.filter((version) => !version.label) : figmaStandInFile.versions, pagination: {} });
        // depth=2: each page with its screens, as in the version asked for.
        const deep = url.searchParams.get("depth") === "2";
        const pages = figmaStandInFile.pages.map((page) => (deep ? { ...page, children: [{ ...figmaStandInFile.frames[page.id], type: "FRAME" }] } : page));
        return answer(200, { name: `Maquette ${key}`, document: { id: "0:0", name: "Document", type: "DOCUMENT", children: pages } });
      }

      answer(404, { status: 404, err: "Not found" });
    });
  });
  return new Promise((resolve) => server.listen(figmaStandInPort, "127.0.0.1", () => resolve(server)));
}
