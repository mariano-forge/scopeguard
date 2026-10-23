// End-to-end tests (`npm run test:e2e`): the app built for production and started on its own port,
// against a test database recreated at each run (kora_test, in the Postgres of docker-compose.yml)
// and Azurite. Mails are never sent: they are written to a file the tests read (codes, links).
// Needs `npm run db:up` first.

import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { figmaClient, figmaStandInPort } from "./tests/e2e/figmaStandIn";

const port = 3199;
export const baseURL = `http://localhost:${port}`;
export const testDatabaseUrl = "postgres://kora:kora@127.0.0.1:5432/kora_test";
export const mailOutbox = resolve("test-results/outbox.jsonl");

export default defineConfig({
  testDir: "tests/e2e",
  // Files run side by side, 4 at a time; the tests of a file run in order, in one worker: a file is a
  // pool. Every test makes its own agency, people and addresses (helpers.ts), so files share nothing;
  // tests that must share something (a fixed address, a limit counted for everyone) stay in one file.
  // Measured on 22 October 2026: 2 min 15 instead of 5 min 30; more workers or tests of a file spread
  // over workers were no faster (one server for all) and made the one-minute limit test fail.
  workers: 4,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, locale: "fr-FR", trace: "retain-on-failure" },
  webServer: {
    command: `npx next build && npx next start -p ${port}`,
    url: `${baseURL}/connexion`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    // Over .env.local: test database and storage, no real mail, and one trusted proxy so that each
    // test client can present its own address (sign-in limits are counted per address).
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_TARGET: "local",
      DATABASE_URL_LOCAL: testDatabaseUrl,
      STORAGE_TARGET: "local",
      RESEND_API_KEY: "",
      MAIL_TRANSPORT: "console",
      MAIL_OUTBOX: mailOutbox,
      BETTER_AUTH_URL: baseURL,
      TRUSTED_PROXY_HOPS: "1",
      MAX_UPLOAD_MB: "1",
      // A video version has its own limit (tests/e2e/video-review.spec.ts), above one block of an
      // upload (8 MB, src/lib/upload.ts): a film is sent in blocks (tests/e2e/direct-upload.spec.ts).
      MAX_VIDEO_UPLOAD_MB: "12",
      FILE_LINK_SECONDS: process.env.FILE_LINK_SECONDS ?? "300",
      // The landing page's demo requests land in a test inbox (tests/e2e/landing.spec.ts).
      DEMO_REQUESTS_TO: "demo@kora.test",
      DEMO_REQUESTS_PER_HOUR: "5",
      // Low enough for the limit tests, high enough for every other test's person.
      UPLOADS_PER_HOUR: "5",
      WRITES_PER_MINUTE: "120",
      // Figma (US-054): its API is the run's stand-in (tests/e2e/figmaStandIn.ts), its consent page an
      // address the tests intercept; a fixed key seals the tokens.
      FIGMA_CLIENT_ID: figmaClient.id,
      FIGMA_CLIENT_SECRET: figmaClient.secret,
      FIGMA_API_URL: `http://127.0.0.1:${figmaStandInPort}`,
      FIGMA_OAUTH_URL: "https://www.figma.test/oauth",
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      // A file's comments read again after 1 s instead of 15: « Actualiser » right after the opening's import.
      FIGMA_IMPORT_QUIET_SECONDS: "1",
      // « Dans Figma » offered in « Nouveau livrable », off online: its tests keep it working while it sleeps.
      FIGMA_COMMENTS: "1",
    },
  },
});
