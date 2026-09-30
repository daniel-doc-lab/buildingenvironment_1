export async function register() {
  // Forbered databasen (migrering + demodata) ved opstart, så første request er hurtig.
  // Ikke på Vercel: en serverless-instans kan fryses uden en aktiv request, midt i
  // klargøringen – dér sker den i stedet inden for første request.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WARM_DB !== "false" && !process.env.VERCEL) {
    const { getDb } = await import("@/db");
    getDb().catch((e) => console.error("Database kunne ikke startes:", e));
  }
}
