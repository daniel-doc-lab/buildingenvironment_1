import "server-only";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: DB; ready?: Promise<void>; kind?: "postgres" | "pglite" };
const g = globalThis as unknown as { __fluksDb?: Holder };
const holder: Holder = (g.__fluksDb ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function init(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_SIZE ?? 5) });
    const db = drizzle(pool, { schema });
    if (process.env.AUTO_MIGRATE !== "false") {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db, { migrationsFolder: MIGRATIONS });
    }
    holder.db = db as unknown as DB;
    holder.kind = "postgres";
  } else {
    // Indlejret Postgres (PGlite) – kræver ingen opsætning. Perfekt til demo og udvikling.
    const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS });
    holder.db = db as unknown as DB;
    holder.kind = "pglite";
  }
  if (process.env.SEED_DEMO !== "false") {
    const { ensureDemoData } = await import("@/server/seed");
    await ensureDemoData(holder.db!);
  }
}

/** Returnerer en klar database (migreret og evt. seedet). */
export async function getDb(): Promise<DB> {
  if (holder.db) return holder.db;
  holder.ready ??= init().catch((e) => {
    holder.ready = undefined;
    throw e;
  });
  await holder.ready;
  return holder.db!;
}

export function dbKind() {
  return holder.kind;
}

export { schema };
