// A local stand-in for Figma's web API (US-054), started by global-setup.ts for the whole run: Kora's
// server reaches it through FIGMA_API_URL (playwright.config.ts) and never reaches Figma.
//
// Figma's consent page is not served here: the browser goes to FIGMA_OAUTH_URL, which the tests intercept
// (page.route) to come straight back with a code. The code says what this stand-in answers:
// "ok:<handle>:<PKCE challenge>" gives tokens for a Figma account named <handle>, only to the verifier
// matching that challenge and only once; anything else is refused, as Figma refuses an unknown code.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export const figmaStandInPort = 3197;
export const figmaClient = { id: "figma-test-client", secret: "figma-test-secret" };

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

      if (request.method === "GET" && url.pathname === "/v1/me") {
        const handle = accounts.get((request.headers.authorization ?? "").replace(/^Bearer /, ""));
        if (!handle) return answer(403, { status: 403, err: "Invalid token" });
        return answer(200, { id: `fig-${handle}`, handle, email: `${handle}@figma.test`, img_url: "" });
      }

      answer(404, { status: 404, err: "Not found" });
    });
  });
  return new Promise((resolve) => server.listen(figmaStandInPort, "127.0.0.1", () => resolve(server)));
}
