// Applies database migrations (the server also does this on first use).
//   node --env-file=.env scripts/migrate.ts

import { migrate, openDb } from "../agent/lib/db.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL yo‘q.");
  process.exit(1);
}
const db = await openDb(url);
const applied = await migrate(db);
console.log(applied.length ? `Qo‘llandi: ${applied.join(", ")}` : "Baza yangi holatda.");
await db.close();
