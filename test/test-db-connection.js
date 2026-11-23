import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_TOKEN,
});

try {
  const result = await client.execute("SELECT 1 AS connected");
  if (result.rows[0]?.connected !== 1) {
    throw new Error("The database returned an unexpected connection result.");
  }
  console.log("Turso/libSQL connection successful.");
} catch (error) {
  console.error("Turso/libSQL connection failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await client.close();
}
