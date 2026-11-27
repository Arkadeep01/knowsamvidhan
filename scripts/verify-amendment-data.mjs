import envModule from "@next/env";
import { createClient } from "@libsql/client";
import { validateAmendmentInput, normalizeNumber, ordinalValue } from "../lib/amendments/validation.mjs";

envModule.loadEnvConfig(process.cwd());

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_TOKEN,
});

const total = await client.execute("SELECT COUNT(*) AS total FROM Amendment");
const duplicates = await client.execute("SELECT number, COUNT(*) AS total FROM Amendment GROUP BY number HAVING COUNT(*) > 1");
const emptyOptionals = await client.execute("SELECT COUNT(*) AS total FROM Amendment WHERE COALESCE(whyItMatters, '') = '' AND COALESCE(relatedArticles, '') = ''");
const sample = await client.execute("SELECT number, year, title FROM Amendment ORDER BY CAST(SUBSTR(number, 1, LENGTH(number) - 2) AS INTEGER) LIMIT 5");
console.log("rows:", total.rows[0].total);
console.log("duplicate numbers:", duplicates.rows.length);
console.log("records with empty whyItMatters and relatedArticles:", emptyOptionals.rows[0].total);
console.log("first five by ordinal:", JSON.stringify(sample.rows));

const valid = validateAmendmentInput({ number: " 42ND ", year: "1976", title: "A", summary: "B" });
const invalid = validateAmendmentInput({ number: "forty-second", year: "76", title: "", summary: "" });
console.log("validation valid:", valid.ok, normalizeNumber(" 42ND "), ordinalValue("42nd"));
console.log("validation invalid:", invalid.ok, invalid.errors.length);
await client.close();
