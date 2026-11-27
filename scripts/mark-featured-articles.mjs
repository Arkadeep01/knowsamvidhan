import fs from "node:fs";
import path from "node:path";
import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const configPath = path.resolve(process.cwd(), "data/constitutional/featured-articles.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_TOKEN });
const placeholders = config.articles.map(() => "?").join(", ");
const found = await client.execute({
  sql: `SELECT articleNumber, featured FROM Article WHERE articleNumber IN (${placeholders}) ORDER BY articleNumber`,
  args: config.articles,
});

const foundNumbers = new Set(found.rows.map((row) => String(row.articleNumber)));
const missing = config.articles.filter((number) => !foundNumbers.has(number));
if (missing.length > 0) {
  console.error(`Missing articles: ${missing.join(", ")}`);
  await client.close();
  process.exit(1);
}

const alreadyFeatured = found.rows.filter((row) => Number(row.featured) === 1).length;
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Requested featured articles: ${config.articles.length}`);
console.log(`Already featured: ${alreadyFeatured}`);
console.log(`To update: ${config.articles.length - alreadyFeatured}`);

if (!apply) {
  await client.close();
  console.log("Dry run complete. No database writes were performed.");
  process.exit(0);
}

for (const number of config.articles) {
  await client.execute({
    sql: "UPDATE Article SET featured = 1, createdAt = createdAt WHERE articleNumber = ?",
    args: [number],
  });
}
const result = await client.execute("SELECT COUNT(*) AS total FROM Article WHERE featured = 1");
await client.close();
console.log(`Featured articles now: ${result.rows[0].total}`);
