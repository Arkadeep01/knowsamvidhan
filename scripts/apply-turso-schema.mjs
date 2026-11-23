import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_TOKEN) {
    throw new Error("DATABASE_URL and DATABASE_TOKEN must be configured.");
  }

  let sql = "";
  for await (const chunk of process.stdin) sql += chunk.toString();
  if (!sql.trim()) throw new Error("Prisma did not generate an initialization schema.");

  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_TOKEN,
  });

  try {
    const existingTables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    if (existingTables.rows.length > 0) {
      throw new Error(
        `Refusing to initialize a non-empty database (${existingTables.rows.length} tables found).`
      );
    }

    await client.executeMultiple(sql);

    const authTables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('User', 'RegistrationOTP') ORDER BY name"
    );
    const names = authTables.rows.map((row) => row.name);
    if (!names.includes("User") || !names.includes("RegistrationOTP")) {
      throw new Error("Schema initialization finished without the required authentication tables.");
    }

    console.log(`Initialized Turso schema; authentication tables are present: ${names.join(", ")}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Turso schema initialization failed:", error.message);
  process.exitCode = 1;
});
