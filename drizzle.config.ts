import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { databaseConfig } from "./src/db/config";

// Same files and precedence as Next for the variables used here.
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const { url, ssl } = databaseConfig();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url, ssl },
  strict: true,
  verbose: true,
});
