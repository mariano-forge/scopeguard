// End-to-end tests (`npm run test:e2e`): the app built for production and started on its own port,
// against a test database recreated at each run (kora_test, in the Postgres of docker-compose.yml)
// and Azurite. Mails are never sent: they are written to a file the tests read (codes, links).
// Needs `npm run db:up` first.

import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const port = 3199;
export const baseURL = `http://localhost:${port}`;
export const testDatabaseUrl = "postgres://kora:kora@127.0.0.1:5432/kora_test";
export const mailOutbox = resolve("test-results/outbox.jsonl");

export default defineConfig({
  testDir: "tests/e2e",
  // One database and one outbox for every test: one worker, tests in order.
  workers: 1,
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
      // The landing page's demo requests land in a test inbox (tests/e2e/landing.spec.ts).
      DEMO_REQUESTS_TO: "demo@kora.test",
      DEMO_REQUESTS_PER_HOUR: "5",
      // Low enough for the limit tests, high enough for every other test's person.
      UPLOADS_PER_HOUR: "5",
      WRITES_PER_MINUTE: "120",
    },
  },
});
