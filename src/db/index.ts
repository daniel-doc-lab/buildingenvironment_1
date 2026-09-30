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
    // Flere serverless-instanser kan starte samtidig (fx på Vercel). En advisory lock på en
    // direkte (ikke-poolet) forbindelse sikrer, at kun én ad gangen migrerer og seeder.
    const lock = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? url, max: 1 });
    const client = await lock.connect();
    try {
      await client.query("select pg_advisory_lock(7428190)");
      if (process.env.AUTO_MIGRATE !== "false") {
        const { migrate } = await import("drizzle-orm/node-postgres/migrator");
        await migrate(db, { migrationsFolder: MIGRATIONS });
      }
      await seed(db as unknown as DB);
    } finally {
      await client.query("select pg_advisory_unlock(7428190)").catch(() => {});
      client.release();
      await lock.end();
    }
    holder.db = db as unknown as DB;
    holder.kind = "postgres";
  } else {
    // Indlejret Postgres (PGlite) – kræver ingen opsætning. Perfekt til demo og udvikling.
    // På Vercel er kun /tmp skrivbar; data lever da kun i den enkelte instans (brug DATABASE_URL).
    const dir =
      process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/fluks-pglite" : path.join(process.cwd(), ".data", "pglite"));
    if (process.env.VERCEL && !process.env.PGLITE_DIR) {
      console.warn("Fluks: DATABASE_URL mangler – bruger midlertidig PGlite i /tmp. Tilføj Neon/Postgres for vedvarende data.");
    }
    if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await seed(db as unknown as DB);
    holder.db = db as unknown as DB;
    holder.kind = "pglite";
  }
}

async function seed(db: DB) {
  if (process.env.SEED_DEMO === "false") return;
  const { ensureDemoData } = await import("@/server/seed");
  await ensureDemoData(db);
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
