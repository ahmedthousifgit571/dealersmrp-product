import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use the direct (non-pooled) Neon connection; the app uses the pooled
// DATABASE_URL through @prisma/adapter-pg (see src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
