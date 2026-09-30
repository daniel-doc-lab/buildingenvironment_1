export async function register() {
  // Forbered databasen (migrering + demodata) ved opstart, så første request er hurtig.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WARM_DB !== "false") {
    const { getDb } = await import("@/db");
    getDb().catch((e) => console.error("Database kunne ikke startes:", e));
  }
}
