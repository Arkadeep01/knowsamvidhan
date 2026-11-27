import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SOURCE_URL = "https://www.legislative.gov.in/static/uploads/2025/07/95ef471035ee0b5e4e5b1cac3d3584c1.pdf";
const PROXY_URL = `https://r.jina.ai/${SOURCE_URL}`;
const cachePath = path.join(os.tmpdir(), "knowsamvidhan-constitution.txt");
const outputDir = path.resolve(process.cwd(), "data/constitutional");

async function getSource() {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, "utf8");
  const response = await fetch(PROXY_URL);
  if (!response.ok) throw new Error(`Failed to fetch official Constitution text: ${response.status}`);
  const text = await response.text();
  fs.writeFileSync(cachePath, text, "utf8");
  return text;
}

function cleanText(value) {
  return value
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/(\d{1,2})\[/g, "")
    .replace(/]/g, "")
    .replace(/\s*\d{1,3}\s+THE CONSTITUTION OF INDIA/g, "")
    .replace(/\s*\([ivxlcdm]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ordinal(value) {
  const match = String(value).match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

const text = await getSource();
const lines = text.split(/\r?\n/);

const articlePartMap = new Map();
const partTitles = new Map();
let currentPart = null;
for (let i = 0; i < 1380; i += 1) {
  const partMatch = lines[i].match(/^\s*PART\s+([IVXA-Z]+)\s*$/);
  if (partMatch) {
    currentPart = partMatch[1];
    for (let j = i + 1; j < i + 8; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || /^ARTICLES$/i.test(candidate) || /^Contents$/i.test(candidate)) continue;
      partTitles.set(currentPart, candidate);
      break;
    }
    continue;
  }
  if (!currentPart) continue;
  const articleMatch = lines[i].replace(/^##\s*/, "").match(/^\[?(\d{1,3}[A-Z]?)\s*\.\s+(.+)$/);
  if (!articleMatch) continue;
  if (!articlePartMap.has(currentPart)) articlePartMap.set(currentPart, []);
  articlePartMap.get(currentPart).push(articleMatch[1]);
}

const contentsTitles = new Map();
for (let i = 0; i < 1380; i += 1) {
  const match = lines[i].match(/^\s*\[?(\d{1,3}[A-Z]?)\s*\.\s+(.+?)\s*\]?\s*$/);
  if (!match) continue;
  const title = cleanText(match[2]).replace(/—Omitted\.?/gi, "").split(/\.\s+\d{1,3}[A-Z]?\s*\./)[0].replace(/\.$/, "").trim();
  if (title && !contentsTitles.has(match[1])) contentsTitles.set(match[1], title);
}

const bodyPartAt = new Map();
let bodyPart = null;
for (let i = 1444; i < 8680; i += 1) {
  const clean = lines[i].replace(/^##\s*/, "").trim();
  const partMatches = clean.match(/\bPART\s+([IVX]{1,5}[AB]?)\b/g);
  if (partMatches) bodyPart = partMatches[partMatches.length - 1].replace(/^PART\s*/, "");
  bodyPartAt.set(i, bodyPart);
}

const articleLine = /^\[?(\d{1,3}[A-Z]?)\s*\.\s*(.+)$/;
const matches = [];
for (let i = 1444; i < 8680; i += 1) {
  const clean = lines[i].replace(/^##\s*/, "").replace(/\s+([.,;:])/g, "$1");
  const match = clean.match(articleLine);
  if (match) matches.push({ index: i, number: match[1], rest: match[2] });
}

const byNumber = new Map();
for (let k = 0; k < matches.length; k += 1) {
  const current = matches[k];
  const title = contentsTitles.get(current.number) || "";
  let body = current.rest;
  if (title && body.toLowerCase().startsWith(title.toLowerCase())) body = body.slice(title.length);
  body = body.replace(/^[\s"“”\[\]—–-]+/u, "");
  if (!title) {
    const dashMatch = body.match(/^(.*?)\s+[—–-]\s*(.*)$/);
    if (dashMatch) body = dashMatch[2];
  }
  const chunks = body.trim() ? [body.trim()] : [];
  const nextIndex = k + 1 < matches.length ? matches[k + 1].index : 8680;
  for (let i = current.index + 1; i < nextIndex; i += 1) {
    const line = lines[i].trim();
    if (!line || /^>\s/.test(line) || /^\d{1,3}$/.test(line)) continue;
    chunks.push(line.replace(/^##\s*/, ""));
  }
  const officialText = cleanText(chunks.join(" ").replace(/^[\s"“”\[\]—–.\-]+/u, ""));
  if (!officialText || /Omitted/i.test(officialText) && officialText.length < 120) continue;
  const previous = byNumber.get(current.number);
  if (!previous) {
    byNumber.set(current.number, {
      articleNumber: `Article ${current.number}`,
      number: current.number,
      title: title || current.rest.replace(/\.$/, "").trim(),
      officialText,
      bodyPart: bodyPartAt.get(current.index) || "",
    });
  }
}

const articles = [...byNumber.values()].sort((a, b) => ordinal(a.number) - ordinal(b.number));
const articleByNumber = new Map(articles.map((article) => [article.number, article]));

function extractClauses(article) {
  const parts = article.officialText.split(/\(\d{1,2}\)\s*/).filter(Boolean);
  if (parts.length < 2) return [];
  return parts.slice(1).map((text, index) => ({
    clauseNumber: String(index + 1),
    text: cleanText(text),
  })).filter((clause) => clause.text.length > 10);
}

const enrichedArticles = articles.map((article) => {
  const firstSentence = article.officialText.split(/(?<=\.)\s/)[0] || article.officialText;
  const partNumber = article.bodyPart || [...articlePartMap.entries()].find(([, numbers]) => numbers.includes(article.number))?.[0] || "";
  const partTitle = partTitles.get(partNumber) || "Constitution of India";
  return {
    articleNumber: article.articleNumber,
    title: article.title,
    shortSummary: firstSentence.slice(0, 300),
    officialText: article.officialText,
    simpleExplanation: firstSentence.slice(0, 500),
    example: "",
    tags: `${partTitle}, Constitution of India`,
    featured: false,
    partNumber: partNumber ? `Part ${partNumber}` : "",
    clauses: extractClauses(article),
    sourceUrl: SOURCE_URL,
  };
});

const parts = [...partTitles.entries()]
  .filter(([roman]) => (articlePartMap.get(roman) || []).some((number) => articleByNumber.has(number)))
  .map(([roman, title]) => {
    const numbers = (articlePartMap.get(roman) || []).filter((number) => articleByNumber.has(number));
    const ordered = numbers.sort((a, b) => ordinal(a) - ordinal(b));
    const range = ordered.length ? `Articles ${ordered[0]}–${ordered[ordered.length - 1]}` : "";
    return {
      partNumber: `Part ${roman}`,
      title,
      range,
      articles: ordered.length,
      description: `${title}. ${range}.`,
      sourceUrl: SOURCE_URL,
    };
  });

const scheduleData = [
  ["I", "First Schedule", "first-schedule", "The States and the Union territories", ["The States", "The Union territories"]],
  ["II", "Second Schedule", "second-schedule", "Provisions as to the President and the Governors of States", ["Part A — Provisions as to the President and the Governors of States", "Part C — Provisions as to the Speaker and the Deputy Speaker of the House of the People and the Chairman and the Deputy Chairman of the Council of States", "Part D — Provisions as to the Judges of the Supreme Court and of the High Courts", "Part E — Provisions as to the Comptroller and Auditor-General of India"]],
  ["III", "Third Schedule", "third-schedule", "Forms of Oaths or Affirmations", ["Forms of Oaths or Affirmations"]],
  ["IV", "Fourth Schedule", "fourth-schedule", "Allocation of seats in the Council of States", ["Allocation of seats in the Council of States"]],
  ["V", "Fifth Schedule", "fifth-schedule", "Provisions as to the Administration and Control of Scheduled Areas and Scheduled Tribes", ["Part A — General", "Part B — Administration and Control of Scheduled Areas and Scheduled Tribes", "Part C — Scheduled Areas", "Part D — Amendment of the Schedule"]],
  ["VI", "Sixth Schedule", "sixth-schedule", "Provisions as to the Administration of Tribal Areas in the States of Assam, Meghalaya, Tripura and Mizoram", ["Provisions as to the Administration of Tribal Areas in the States of Assam, Meghalaya, Tripura and Mizoram"]],
  ["VII", "Seventh Schedule", "seventh-schedule", "Union List, State List and Concurrent List", ["List I — Union List", "List II — State List", "List III — Concurrent List"]],
  ["VIII", "Eighth Schedule", "eighth-schedule", "Languages", ["Languages"]],
  ["IX", "Ninth Schedule", "ninth-schedule", "Validation of certain Acts and Regulations (Article 31B)", ["Validation of certain Acts and Regulations"]],
  ["X", "Tenth Schedule", "tenth-schedule", "Provisions as to disqualification on ground of defection", ["Provisions as to disqualification on ground of defection"]],
  ["XI", "Eleventh Schedule", "eleventh-schedule", "Powers, authority and responsibilities of Panchayats", ["Powers, authority and responsibilities of Panchayats"]],
  ["XII", "Twelfth Schedule", "twelfth-schedule", "Powers, authority and responsibilities of Municipalities, etc. (Article 243W)", ["Powers, authority and responsibilities of Municipalities, etc."]],
];

const schedules = scheduleData.map(([shortId, schedule, slug, title, topics]) => ({
  shortId,
  schedule,
  slug,
  title,
  description: title,
  topics,
  tagDetails: topics.map((topic) => ({ tag: topic.split("—")[0].trim(), detail: topic.replace(/^[^—]+—\s*/, "").trim() || topic })),
  sourceUrl: SOURCE_URL,
}));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "parts.json"), `${JSON.stringify(parts, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "articles.json"), `${JSON.stringify(enrichedArticles, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "schedules.json"), `${JSON.stringify(schedules, null, 2)}\n`, "utf8");

console.log(`parts: ${parts.length}`);
console.log(`articles: ${enrichedArticles.length}`);
console.log(`clauses: ${enrichedArticles.reduce((sum, article) => sum + article.clauses.length, 0)}`);
console.log(`schedules: ${schedules.length}`);
console.log(`sample article 14: ${JSON.stringify(enrichedArticles.find((article) => article.articleNumber === "Article 14"))}`);
console.log(`sample part: ${JSON.stringify(parts[2])}`);
