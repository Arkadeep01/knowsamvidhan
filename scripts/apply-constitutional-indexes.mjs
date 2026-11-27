import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_TOKEN,
});

const statements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS "Part_partNumber_key" ON "Part"("partNumber")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Article_articleNumber_key" ON "Article"("articleNumber")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Clause_articleId_clauseNumber_key" ON "Clause"("articleId", "clauseNumber")',
];
for (const statement of statements) await client.execute(statement);
for (const table of ["Part", "Article", "Clause"]) {
  const result = await client.execute(`PRAGMA index_list(${table})`);
  console.log(`${table} indexes:`, JSON.stringify(result.rows));
}
await client.close();
