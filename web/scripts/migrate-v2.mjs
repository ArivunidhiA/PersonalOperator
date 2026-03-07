// V2 migration: hybrid RAG, semantic memory, share tokens, follow-up tracking
// Run: node scripts/migrate-v2.mjs  (prints SQL to run in Supabase)
// Or copy from scripts/migrate-v2.sql and paste into Supabase SQL Editor

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "migrate-v2.sql");
const SQL = readFileSync(sqlPath, "utf8");

console.log("\n=== V2 MIGRATION SQL ===\n");
console.log("Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard):\n");
console.log(SQL);
console.log("\n=== END SQL ===\n");
