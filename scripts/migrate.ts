/** Kører databasemigreringer (og seeder demodata hvis SEED_DEMO ikke er "false"). Brug: npm run db:migrate */
import { getDb, dbKind } from "@/db";

getDb()
  .then(() => {
    console.log(`✓ Database klar (${dbKind()})`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
