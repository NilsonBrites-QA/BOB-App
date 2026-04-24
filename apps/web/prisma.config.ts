
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Carregar .env.local com prioridade sobre .env
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    directUrl: process.env.DIRECT_URL,
  },
});
