import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const base = path.resolve(process.cwd(), "data/constitutional");
const logPath = path.join(base, "ingestion-log.json");
const sourceUrl = "https://www.legislative.gov.in/static/uploads/2025/07/95ef471035ee0b5e4e5b1cac3d3584c1.pdf";

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(base, name), "utf8"));
}

const parts = read("parts.json");
const articles = read("articles.json");
const schedules = read("schedules.json");
const clauses = articles.flatMap((article) =>
  article.clauses.map((clause) => ({ ...clause, articleNumber: article.articleNumber })),
);

function validate() {
  const errors = [];
  for (const part of parts) {
    if (!/^Part [IVXA-Z]+$/.test(part.partNumber) || !part.title || !part.range || typeof part.articles !== "number") {
      errors.push(`Invalid part ${part.partNumber}`);
    }
  }
  for (const article of articles) {
    if (!/^Article \d{1,3}[A-Z]?$/.test(article.articleNumber) || !article.title || article.officialText.length < 20) {
      errors.push(`Invalid article ${article.articleNumber}`);
    }
  }
  for (const clause of clauses) {
    if (!clause.clauseNumber || !clause.text) errors.push(`Invalid clause ${clause.articleNumber}/${clause.clauseNumber}`);
  }
  for (const schedule of schedules) {
    if (!/^[a-z0-9-]+$/.test(schedule.slug) || !schedule.title || !Array.isArray(schedule.topics) || !Array.isArray(schedule.tagDetails)) {
      errors.push(`Invalid schedule ${schedule.slug}`);
    }
  }
  return errors;
}

const errors = validate();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_TOKEN });

const duplicateChecks = [
  ["Part", 'SELECT partNumber, COUNT(*) AS total FROM "Part" GROUP BY partNumber HAVING COUNT(*) > 1'],
  ["Article", 'SELECT articleNumber, COUNT(*) AS total FROM "Article" GROUP BY articleNumber HAVING COUNT(*) > 1'],
  ["Clause", 'SELECT articleId, clauseNumber, COUNT(*) AS total FROM "Clause" GROUP BY articleId, clauseNumber HAVING COUNT(*) > 1'],
  ["Schedule", 'SELECT slug, COUNT(*) AS total FROM "Schedule" GROUP BY slug HAVING COUNT(*) > 1'],
];
for (const [name, sql] of duplicateChecks) {
  const result = await client.execute(sql);
  if (result.rows.length > 0) {
    console.error(`Duplicate rows found in ${name}: ${result.rows.length} groups`);
    await client.close();
    process.exit(1);
  }
}

const existingParts = await client.execute('SELECT id, partNumber, title, range, articles, description FROM "Part"');
const existingArticles = await client.execute('SELECT id, articleNumber, title, shortSummary, officialText, simpleExplanation, example, tags, partId FROM "Article"');
const existingClauses = await client.execute('SELECT id, articleId, clauseNumber, text FROM "Clause"');
const existingSchedules = await client.execute('SELECT id, slug, shortId, schedule, title, description, topics, tagDetails FROM "Schedule"');

const partById = new Map(existingParts.rows.map((row) => [String(row.partNumber), row]));
const articleById = new Map(existingArticles.rows.map((row) => [String(row.articleNumber), row]));
const clauseById = new Map(existingClauses.rows.map((row) => [`${String(row.articleId)}:${String(row.clauseNumber)}`, row]));
const scheduleById = new Map(existingSchedules.rows.map((row) => [String(row.slug), row]));

function classify(records, key, existing, compare) {
  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  const actions = records.map((record) => {
    const current = existing.get(String(record[key]));
    if (!current) {
      inserts += 1;
      return "insert";
    }
    if (compare(record, current)) {
      updates += 1;
      return "update";
    }
    unchanged += 1;
    return "unchanged";
  });
  return { inserts, updates, unchanged, actions };
}

const partPlan = classify(parts, "partNumber", partById, (record, current) =>
  String(current.title) !== record.title ||
  String(current.range) !== record.range ||
  Number(current.articles) !== record.articles ||
  String(current.description ?? "") !== record.description,
);
const articlePlan = classify(articles, "articleNumber", articleById, (record, current) =>
  String(current.title) !== record.title ||
  String(current.shortSummary ?? "") !== record.shortSummary ||
  String(current.officialText ?? "") !== record.officialText ||
  String(current.simpleExplanation ?? "") !== record.simpleExplanation ||
  String(current.tags ?? "") !== record.tags,
);
const articleIdByNumber = new Map(existingArticles.rows.map((row) => [String(row.articleNumber), String(row.id)]));
let clauseInserts = 0;
let clauseUpdates = 0;
let clauseUnchanged = 0;
const clauseActions = clauses.map((clause) => {
  const articleId = articleIdByNumber.get(clause.articleNumber);
  const current = articleId ? clauseById.get(`${articleId}:${clause.clauseNumber}`) : null;
  if (!current) {
    clauseInserts += 1;
    return "insert";
  }
  if (String(current.text) !== clause.text) {
    clauseUpdates += 1;
    return "update";
  }
  clauseUnchanged += 1;
  return "unchanged";
});
const clausePlan = { inserts: clauseInserts, updates: clauseUpdates, unchanged: clauseUnchanged, actions: clauseActions };
const schedulePlan = classify(schedules, "slug", scheduleById, (record, current) =>
  String(current.shortId) !== record.shortId ||
  String(current.title) !== record.title ||
  String(current.description ?? "") !== record.description ||
  String(current.topics ?? "") !== record.topics.join(", ") ||
  String(current.tagDetails ?? "") !== JSON.stringify(record.tagDetails),
);

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Source: ${sourceUrl}`);
console.log(`Parts: ${parts.length} (insert ${partPlan.inserts}, update ${partPlan.updates}, unchanged ${partPlan.unchanged})`);
console.log(`Articles: ${articles.length} (insert ${articlePlan.inserts}, update ${articlePlan.updates}, unchanged ${articlePlan.unchanged})`);
console.log(`Clauses: ${clauses.length} (insert ${clausePlan.inserts}, update ${clausePlan.updates}, unchanged ${clausePlan.unchanged})`);
console.log(`Schedules: ${schedules.length} (insert ${schedulePlan.inserts}, update ${schedulePlan.updates}, unchanged ${schedulePlan.unchanged})`);
console.log(`Duplicate groups before write: 0`);

if (!apply) {
  await client.close();
  console.log("Dry run complete. No database writes were performed.");
  process.exit(0);
}

const partIds = new Map();
for (let index = 0; index < parts.length; index += 1) {
  const part = parts[index];
  const result = await client.execute({
    sql: 'INSERT INTO "Part" (id, partNumber, title, range, articles, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT("partNumber") DO UPDATE SET title = excluded.title, range = excluded.range, articles = excluded.articles, description = excluded.description RETURNING id',
    args: [randomUUID(), part.partNumber, part.title, part.range, part.articles, part.description],
  });
  partIds.set(part.partNumber, String(result.rows[0].id));
}

const articleIds = new Map();
for (let index = 0; index < articles.length; index += 1) {
  const article = articles[index];
  const partId = partIds.get(article.partNumber);
  if (!partId) throw new Error(`Missing part for ${article.articleNumber}`);
  const result = await client.execute({
    sql: 'INSERT INTO "Article" (id, articleNumber, title, shortSummary, officialText, simpleExplanation, example, tags, featured, partId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT("articleNumber") DO UPDATE SET title = excluded.title, shortSummary = excluded.shortSummary, officialText = excluded.officialText, simpleExplanation = excluded.simpleExplanation, example = excluded.example, tags = excluded.tags, partId = excluded.partId RETURNING id',
    args: [randomUUID(), article.articleNumber, article.title, article.shortSummary, article.officialText, article.simpleExplanation, article.example, article.tags, article.featured ? 1 : 0, partId],
  });
  articleIds.set(article.articleNumber, String(result.rows[0].id));
}

for (const clause of clauses) {
  const articleId = articleIds.get(clause.articleNumber);
  if (!articleId) continue;
  await client.execute({
    sql: 'INSERT INTO "Clause" (id, clauseNumber, text, createdAt, articleId) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?) ON CONFLICT("articleId", "clauseNumber") DO UPDATE SET text = excluded.text',
    args: [randomUUID(), clause.clauseNumber, clause.text, articleId],
  });
}

for (const schedule of schedules) {
  await client.execute({
    sql: 'INSERT INTO "Schedule" (id, shortId, schedule, slug, title, description, topics, createdAt, updatedAt, tagDetails) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?) ON CONFLICT("slug") DO UPDATE SET shortId = excluded.shortId, schedule = excluded.schedule, title = excluded.title, description = excluded.description, topics = excluded.topics, tagDetails = excluded.tagDetails, updatedAt = CURRENT_TIMESTAMP',
    args: [randomUUID(), schedule.shortId, schedule.schedule, schedule.slug, schedule.title, schedule.description, schedule.topics.join(", "), JSON.stringify(schedule.tagDetails)],
  });
}

await client.close();

const log = {
  appliedAt: new Date().toISOString(),
  sourceUrl,
  parts: { records: parts.length, ...partPlan },
  articles: { records: articles.length, ...articlePlan },
  clauses: { records: clauses.length, ...clausePlan },
  schedules: { records: schedules.length, ...schedulePlan },
};
fs.writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
console.log(`Applied data and wrote provenance log to ${logPath}`);
