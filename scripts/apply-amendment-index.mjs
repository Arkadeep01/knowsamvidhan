import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_TOKEN,
});

await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS "Amendment_number_key" ON "Amendment"("number")');
const indexes = await client.execute("PRAGMA index_list(Amendment)");
console.log("indexes:", JSON.stringify(indexes.rows));
await client.close();
