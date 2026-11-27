import fs from "node:fs";
import path from "node:path";
import envModule from "@next/env";
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { validateManifestRecord } from "../lib/amendments/validation.mjs";

envModule.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const manifestPath = path.resolve(process.cwd(), "data/amendments/verified-amendments.json");
const logPath = path.resolve(process.cwd(), "data/amendments/ingestion-log.json");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readManifest() {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Manifest must be an array");
  return parsed;
}

async function main() {
  const manifest = readManifest();
  const validated = [];
  for (const record of manifest) {
    const result = validateManifestRecord(record);
    if (!result.ok) {
      fail(`Invalid record ${record && record.number}: ${result.errors.join("; ")}`);
      return;
    }
    validated.push(result.value);
  }

  const numbers = validated.map((record) => record.number);
  if (new Set(numbers).size !== numbers.length) {
    fail("Manifest contains duplicate amendment numbers");
    return;
  }

  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_TOKEN;
  if (!url || !authToken) {
    fail("DATABASE_URL and DATABASE_TOKEN must be configured");
    return;
  }

  const client = createClient({ url, authToken });
  const duplicates = await client.execute(
    "SELECT number, COUNT(*) AS total FROM Amendment GROUP BY number HAVING COUNT(*) > 1"
  );
  if (duplicates.rows.length > 0) {
    fail(`Duplicate amendment numbers found in target database: ${duplicates.rows.map((row) => row.number).join(", ")}`);
    await client.close();
    return;
  }

  const existingRows = await client.execute("SELECT id, number, year, title, summary FROM Amendment");

  const existing = new Map();
  for (const row of existingRows.rows) existing.set(String(row.number), row);

  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  const plan = [];
  for (const record of validated) {
    const current = existing.get(record.number);
    if (!current) {
      inserts += 1;
      plan.push({ number: record.number, action: "insert", sourceUrl: record.sourceUrl });
      continue;
    }
    const changed =
      String(current.year) !== record.year ||
      String(current.title) !== record.title ||
      String(current.summary) !== record.summary;
    if (changed) {
      updates += 1;
      plan.push({ number: record.number, action: "update", sourceUrl: record.sourceUrl });
    } else {
      unchanged += 1;
      plan.push({ number: record.number, action: "unchanged", sourceUrl: record.sourceUrl });
    }
  }

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Manifest records: ${validated.length}`);
  console.log(`Existing amendment rows: ${existing.size}`);
  console.log(`Duplicate numbers in target database: ${duplicates.rows.length}`);
  console.log(`Planned inserts: ${inserts}`);
  console.log(`Planned updates: ${updates}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Referenced article numbers identified for provenance: ${new Set(validated.flatMap((record) => record.referencedArticles)).size}`);
  if (!apply) {
    await client.close();
    console.log("Dry run complete. No database writes were performed.");
    return;
  }

  const results = [];
  try {
    for (let index = 0; index < validated.length; index += 1) {
      const record = validated[index];
      const action = plan[index].action;
      let id;
      if (action === "insert") {
        const inserted = await client.execute({
          sql: 'INSERT INTO Amendment (id, number, year, title, summary, whyItMatters, relatedArticles, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id',
          args: [randomUUID(), record.number, record.year, record.title, record.summary, "", ""],
        });
        id = String(inserted.rows[0].id);
      } else if (action === "update") {
        await client.execute({
          sql: "UPDATE Amendment SET year = ?, title = ?, summary = ?, updatedAt = CURRENT_TIMESTAMP WHERE number = ?",
          args: [record.year, record.title, record.summary, record.number],
        });
        id = String(existing.get(record.number).id);
      } else {
        id = String(existing.get(record.number).id);
      }
      results.push({ id, number: record.number, sourceUrl: record.sourceUrl, sourceNotes: record.sourceNotes });
    }
  } finally {
    await client.close();
  }

  const log = {
    appliedAt: new Date().toISOString(),
    records: results.length,
    inserted: inserts,
    updated: updates,
    unchanged,
    note: "Provenance manifest is data/amendments/verified-amendments.json relatedArticles left empty because Article records are absent.",
    results,
  };
  fs.writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  console.log(`Applied ${results.length} records and wrote provenance log to ${logPath}`);
}

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exitCode = 1;
});
