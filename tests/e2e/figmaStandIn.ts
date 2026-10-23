// A local stand-in for Figma's web API (US-054), started by global-setup.ts for the whole run: Kora's
// server reaches it through FIGMA_API_URL (playwright.config.ts) and never reaches Figma.
//
// Figma's consent page is not served here: the browser goes to FIGMA_OAUTH_URL, which the tests intercept
// (page.route) to come straight back with a code. The code says what this stand-in answers:
// "ok:<handle>:<PKCE challenge>" gives tokens for a Figma account named <handle>, only to the verifier
// matching that challenge and only once; anything else is refused, as Figma refuses an unknown code.
//
// Files: every key is a file named "Maquette <key>", with three pages and its history (figmaStandInFile).
// A key starting with "Absent" is a file the account cannot open; "Unsaved" one with no named version.

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
  versions: [
    { id: "102", label: "V2 envoyée au client", description: "", created_at: "2026-10-22T10:00:00Z", user: { handle: "Mariano" } },
    { id: "101b", label: null, description: null, created_at: "2026-10-21T10:00:00Z", user: { handle: "Mariano" } },
    { id: "101", label: "V1 envoyée au client", description: "", created_at: "2026-10-20T09:00:00Z", user: { handle: "Mariano" } },
  ],
};

export function startFigmaStandIn(redirectUri: string): Promise<Server> {
  const used = new Set<string>();
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

      const file = /^\/v1\/files\/([A-Za-z0-9]+)(\/versions)?$/.exec(url.pathname);
      if (request.method === "GET" && file) {
        const [, key, history] = file;
        if (key.startsWith("Absent")) return answer(404, { status: 404, err: "Not found" });
        if (history) return answer(200, { versions: key.startsWith("Unsaved") ? figmaStandInFile.versions.filter((version) => !version.label) : figmaStandInFile.versions, pagination: {} });
        return answer(200, { name: `Maquette ${key}`, document: { id: "0:0", name: "Document", type: "DOCUMENT", children: figmaStandInFile.pages } });
      }

      answer(404, { status: 404, err: "Not found" });
    });
  });
  return new Promise((resolve) => server.listen(figmaStandInPort, "127.0.0.1", () => resolve(server)));
}
