import { PrismaClient } from "@prisma/client";
import path from "node:path";

function getResolvedDatabaseUrl(): string | undefined {
  const fallback = `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;
  const url = process.env.DATABASE_URL;
  if (!url) return fallback;

  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (filePath.startsWith(".") || filePath.startsWith("..")) {
      const absPath = path.resolve(process.cwd(), filePath);
      return `file:${absPath}`;
    }
  }

  return url;
}

declare global {
  var __db: PrismaClient | undefined;
}

export const db: PrismaClient =
  globalThis.__db ??
  new PrismaClient({
    datasources: {
      db: { url: getResolvedDatabaseUrl() },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__db = db;
}

