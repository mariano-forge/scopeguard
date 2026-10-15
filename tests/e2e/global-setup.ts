// Before the run: a fresh test database with every migration, and an empty mail outbox.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";
import { mailOutbox, testDatabaseUrl } from "../../playwright.config";

export default async function globalSetup() {
  const admin = new Client({ connectionString: testDatabaseUrl.replace(/\/kora_test$/, "/kora") });
  try {
    await admin.connect();
  } catch {
    throw new Error("Postgres is not reachable on 127.0.0.1:5432: start it with `npm run db:up`.");
  }
  await admin.query("drop database if exists kora_test with (force)");
  await admin.query("create database kora_test");
  await admin.end();

  execSync("npx drizzle-kit migrate", { env: { ...process.env, DATABASE_TARGET: "local", DATABASE_URL_LOCAL: testDatabaseUrl }, stdio: "ignore" });

  mkdirSync(dirname(mailOutbox), { recursive: true });
  writeFileSync(mailOutbox, "");
}
