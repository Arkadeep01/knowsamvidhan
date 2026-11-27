import envModule from "@next/env";
import { createClient } from "@libsql/client";

envModule.loadEnvConfig(process.cwd());
const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_TOKEN });

for (const [table, column] of [["Part", "partNumber"], ["Article", "articleNumber"], ["Clause", "articleId, clauseNumber"], ["Schedule", "slug"]]) {
  const count = await client.execute(`SELECT COUNT(*) AS total FROM ${table}`);
  const duplicates = await client.execute(`SELECT ${column}, COUNT(*) AS total FROM ${table} GROUP BY ${column} HAVING COUNT(*) > 1`);
  console.log(`${table}: rows=${count.rows[0].total} duplicateGroups=${duplicates.rows.length}`);
}

const articlesWithText = await client.execute("SELECT COUNT(*) AS total FROM Article WHERE LENGTH(COALESCE(officialText, '')) > 20");
const articlesWithExplanation = await client.execute("SELECT COUNT(*) AS total FROM Article WHERE LENGTH(COALESCE(simpleExplanation, '')) > 20");
const schedulesWithDetails = await client.execute("SELECT COUNT(*) AS total FROM Schedule WHERE json_array_length(tagDetails) > 0");
console.log(`articlesWithText=${articlesWithText.rows[0].total}`);
console.log(`articlesWithExplanation=${articlesWithExplanation.rows[0].total}`);
console.log(`schedulesWithAccordionDetails=${schedulesWithDetails.rows[0].total}`);

const sample = await client.execute('SELECT articleNumber, title, LENGTH(officialText) AS textLength FROM Article WHERE articleNumber IN (\'Article 14\', \'Article 21\', \'Article 246A\') ORDER BY articleNumber');
console.log("samples:", JSON.stringify(sample.rows));
await client.close();
