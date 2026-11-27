# Amendment Integration — Audit and Implementation Plan

Status: **AUDIT ONLY — NO IMPLEMENTATION PERFORMED. AWAITING EXPLICIT APPROVAL.**

Scope: read-only audit of the existing amendment frontend, backend, database, migrations and authoritative public data sources. No application files were created or modified. The only file written is this report, as required by Phase 4.

Guiding rule: the existing frontend is the source of truth. Only fields the existing UI actually renders are proposed as required data. Candidate metadata (assent date, commencement date, Act number, official source link, legal status) was investigated but is **not** proposed as new database/API fields because the current UI does not display it.

---

## 1. Existing frontend architecture

### 1.1 Routes and components

| Surface | File | Purpose |
| --- | --- | --- |
| Admin CRUD | `app/(admin)/amendments/page.tsx` | Create/edit/delete/list amendments |
| Public timeline | `app/(user)/user_amendments/page.tsx` | Horizontally scrolling amendment timeline |
| Public detail | `app/(user)/user_amendments/[slug]/page.tsx` | Single amendment + related articles + other amendments |
| Home hero | `components/ConstitutionHero.tsx` | "Important Amendments" cards (4 randomly chosen) |
| Navigation | `components/Navbar.tsx:23`, `components/Footer.tsx:27-29`, `components/admin_sidebar.tsx:85-89`, `app/(admin)/activity-logs/page.tsx:22` | Links to `/user_amendments` / `/amendments` |

There are no `loading.tsx`, `error.tsx` or `not-found.tsx` route files for amendments; all states are inline.

### 1.2 Fields rendered by the UI

The three amendment-facing components all use the same seven-field shape:

- `app/(admin)/amendments/page.tsx:23-31` — `id, number, year, title, summary, whyItMatters, relatedArticles`.
- `app/(user)/user_amendments/page.tsx:8-18` — same seven plus `createdAt, updatedAt` (declared, never rendered).
- `app/(user)/user_amendments/[slug]/page.tsx:9-17` — same seven (no timestamps).

Usage details:

- `number`: shown as `"{number} Amendment"` and used as the **slug source** (`slugify`, list `:51-53`, detail `:59-61`) and as the key for hardcoded `ERA_MAP`/`COLOR_MAP` (list `:20-28`, detail `:27-45`).
- `year`: pill/badge on list cards (`:83-90`), breadcrumb on detail (`:233`), sidebar on detail (`:433`), home card chip (`ConstitutionHero.tsx:828`).
- `title`: list card heading (`:101-105`), detail H1 (`:267-272`), admin card title (`:350-352`), home card (`:840`).
- `summary`: clamped 3-line card text (list `:108-119`), full detail text (detail `:335`), admin card (`:354-356`), home card (`:844`).
- `whyItMatters`: optional amber callout in list (`:122-146`), detail (`:281-304`), admin (`:360-374`); rendered only when truthy.
- `relatedArticles`: comma-separated string, split/trim/filtered into chips on list (`:66-68`) and admin (`:387`), and used as **article slugs** for `/api/articles/{ref}` requests on detail (`:96-113`). `app/api/articles/[slug]/route.ts:4-13` converts `article-14` → `Article 14`, so stored values must be lowercase slugs such as `article-14`, not `Article 14`.
- `id`: React keys, "Other Amendments" exclusion (detail `:158`), admin PUT/DELETE path param, home palette hash (`ConstitutionHero.tsx:179-183`).
- `createdAt`: not displayed, but used by the backend for list ordering.

Related article objects consumed by detail (`[slug]/page.tsx:19-25`): `id, articleNumber, title, shortSummary, tags`.

### 1.3 Interactions and states

- List: horizontal scroll (`:262-324`), whole-card click → `router.push('/user_amendments/' + slugify(number))` (`:305-307`), 5 pulsing skeleton cards while loading (`:270-282`), **no empty state**, errors silently end loading (`:194`). No search/filter/sort/pagination.
- Detail: `Promise.all` of detail + list (`:87-94`), N article fetches (`:102-113`), back button (`:195-214`), "Other Amendments" buttons (`:424-426`), article `<Link>`s (`:373-375`), 3-bar skeleton (`:122-135`), "Amendment not found" 404 view with back link (`:138-154`).
- Admin: create/edit modal (`:407-542`), delete confirmation (`:545-577`), toast (`:258-267`), loader (`:298-303`), empty card "No amendments yet" (`:304-317`). **Form has inputs only for Number/Year/Title/Summary** (`:439-515`); `whyItMatters` and `relatedArticles` are carried in `FormData` but cannot be edited in the UI.
- Home hero: 4 `CardSkeleton`s (`:814`), whole-card click (`:823`), random 4 reshuffled every 5 minutes (`:195-197`, `:347-352`), empty array on fetch error (`:338-343`), no empty state.
- Hardcoded (not backend-driven): `ERA_MAP`, colors, admin dashboard text `app/(admin)/ad-dashboard/page.tsx:190`, footer `"106+" Amendments` stat `components/Footer.tsx:107`, hero `"106 Amendments"` text `ConstitutionHero.tsx:572`, hero quick-reference text `ConstitutionHero.tsx:189`. The hero search input (`ConstitutionHero.tsx:523-527`) has no handler and is not an amendment search.

### 1.4 Frontend API calls

| Call | Location | Expected response |
| --- | --- | --- |
| `GET /api/amendments` | list `:188-194`; detail `:89` | bare array **or** `{amendments:[]}` |
| `GET /api/amendments/{slug}` | detail `:88` | bare amendment object or `{error}` |
| `GET /api/random_amendments` | hero `:327-345` | bare array only |
| `GET /api/articles/{ref}` | detail `:104` | bare Article object or `{error}` |
| `GET/POST/PUT/DELETE /api/admin/amendments[/id]` | admin `:90`, `:171-177`, `:194-200`, `:229-231` | `{amendments}`, `{amendment}`, `{success:true}` |

No amendment page sends `?q=`, and no amendment UI performs search/filter/sort/pagination.

---

## 2. Existing backend architecture

### 2.1 Amendment endpoints (all already exist; no new endpoints needed)

| Route | Behavior | Key lines |
| --- | --- | --- |
| `app/api/amendments/route.ts` | Security middleware first; reads but does not use `?q=`; `findMany({orderBy:{createdAt:"asc"}})`; bare array; `{error}` on 400/500 | `:8-45` |
| `app/api/amendments/[slug]/route.ts` | `findFirst({number:{equals:slug}})`; 404 `{error:"Amendment not found"}`; bare object | `:4-28` |
| `app/api/random_amendments/route.ts` | `findMany({orderBy:{year:"asc"}})`; bare array | `:7-18` |
| `app/api/admin/amendments/route.ts` | GET `{amendments}`; POST creates from 6 body fields with `?? ""` defaults, returns `{amendment}`, 201; no validation/try-catch | `:7-31` |
| `app/api/admin/amendments/[id]/route.ts` | PUT updates all 6 fields; DELETE returns `{success:true}`; try/catch returns 500 for missing id (no 404) | `:5-48` |

Auth is enforced only in `proxy.ts:117-158` (`/api/admin/*` JWT role check) with matcher entries at `proxy.ts:205-229`. No route-level guard is used by amendment routes; this is the established pattern for admin content routes and must not be duplicated.

### 2.2 Services and existing consumers

- No amendment repository/service module exists; routes call `prisma.amendment` directly.
- `app/api/conversations/[id]/messages/route.ts:134-148` and `:346-358` read all amendments in a transaction for citation verification.
- `lib/verification.ts:190-306` `verifyAmendment(...)` matches citations against `amendment.number`/`year` and uses `summary`/`title` as `originalPassage`; `:548-556` extraction regex; `:850-903` pipeline dispatch.
- `lib/evaluationRunner.ts:166` and `lib/productionMonitoring.ts:177` currently pass `amendments: []`.
- `lib/goldenBenchmark.ts` (~165 cases, many amendment-tagged) is evaluation data, not application data.
- No `prisma/seed.ts`, no ingestion job. `docs/update-prisma-migration.md:9` documents an unimplemented plan to "Insert all enacted Amendment Acts". `scripts/apply-turso-schema.mjs:21-28` only applies schema and refuses a non-empty DB.

### 2.3 Conventions to reuse

- Public list/detail routes: `createSecurityMiddleware()` from `lib/security.ts:181-279`, `sanitizeInput()` at `:89-115`, audit writes via `recordSecurityAudit()` in `lib/security-engine.ts:261-286`.
- Error shape: `NextResponse.json({error:"..."}, {status})` and `console.error("METHOD /route error:", error)`.
- Admin response shapes: `{amendments}`, `{amendment}`, `{success:true}` — must remain unchanged for the existing admin page.
- Nearby admin routes (`app/api/admin/articles/[id]/route.ts:19-42`) use conditional spreads for "safe partial update"; amendment PUT currently overwrites all fields.

---

## 3. Existing database schema and amendment records

### 3.1 Model

`prisma/schema.prisma:102-112`:

```prisma
model Amendment {
  id              String   @id @default(uuid())
  number          String
  year            String
  title           String
  summary         String
  whyItMatters    String?
  relatedArticles String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

No relations to `Article`, `Part`, `Clause`, `Schedule` or `Quiz`; no `@@unique` or `@@index`; `year` is `String`. `Part`/`Article` relations exist only among themselves (`schema.prisma:53-87`). `Schedule.slug` is unique (`:98`), which is the pattern used by article/part/schedule detail routes.

### 3.2 Migration history and live state

- `prisma/migrations/20260430173542_init/migration.sql:111-124` creates `Amendment` with exactly the current columns; no later migration alters it. No schema drift.
- `prisma/migrations/20260430175902_fix_preamble_structure/migration.sql` touches the removed Preamble table only. `prisma/migrations/20261126000000_drop_preamble/migration.sql` drops Preamble; unrelated to amendments.
- `prisma/migrations/migration_lock.toml:3` declares `postgresql` while `schema.prisma:6-10` declares `sqlite`; production uses the libSQL adapter (`lib/prisma.ts:7-16`). The reachable database has **no** `_prisma_migrations` table (schema was pushed via `scripts/apply-turso-schema.mjs`), so Prisma `migrate deploy` cannot be assumed on production.
- Read-only verification executed during this audit (no writes): `SELECT COUNT(*) FROM Amendment` → **0**; `Article`, `Part`, `Clause`, `Schedule`, `Quiz` are also empty; no migration tables.
- No structured amendment seed data exists in the repository. Amendment mentions in `components/ConstitutionHero.tsx:189`, `lib/goldenBenchmark.ts`, `app/(user)/user_quiz/page.tsx` and `lib/preamble/verifiedSource.ts` are prose/fixtures, not DB records.

**Conclusion:** the existing model can support the frontend as-is. It is currently empty, so every amendment-backed surface renders empty/404 today.

---

## 4. Frontend-to-backend field mapping

| UI field | Type | Rendered where | DB field | Notes / data requirement |
| --- | --- | --- | --- | --- |
| `id` | string | keys, admin URL, "Other Amendments", home palette | `Amendment.id` | UUID generated on insert; slug is **not** id |
| `number` | string | label, slug, color/era lookup | `Amendment.number` | Must be canonical lowercase ordinal (`1st`, `42nd`, `106th`) so `slugify(number)` matches `findFirst({number:{equals:slug}})` |
| `year` | string | pill, breadcrumb, sidebar, home | `Amendment.year` | Enactment year, 4 digits; primary chronological display value |
| `title` | string | card/detail H1/admin/home | `Amendment.title` | Official title from the Act/Gazette, e.g. `The Constitution (First Amendment) Act, 1951` |
| `summary` | string | list/detail/admin/home | `Amendment.summary` | Verified description of what the amendment did; also used by citation verification as `originalPassage` |
| `whyItMatters` | string (nullable) | optional callout | `Amendment.whyItMatters` | Optional; must be `""` or null when no verified explanation exists |
| `relatedArticles` | string (nullable) | chips + detail article fetches | `Amendment.relatedArticles` | Comma-separated **article slugs** (`article-14`, `article-21a`), because detail fetches `/api/articles/{ref}` |
| `createdAt`/`updatedAt` | string | declared only | `Amendment.createdAt/updatedAt` | Not rendered; currently drive list ordering |

### Candidate metadata investigated but deliberately excluded from the schema

| Candidate | Verified availability | Decision |
| --- | --- | --- |
| Presidential assent date | Available in official Act/Gazette text (e.g. 1st `[18th June, 1951]`, 101st `8 Sep 2016`, 106th `28 Sep 2023`) | No DB/API field; UI does not display it. Keep in ingestion provenance manifest only |
| Commencement date | Available but often multi-valued/conditional (42nd has three commencement batches; 73rd `24-4-1993` via S.O. 267(E); 106th `16-4-2026` via S.O. 1922(E)) | No DB/API field; too complex to collapse without UI support |
| Act number ("X of YYYY") | Not visible in the official PDFs successfully fetched | Do not store; would be fabricated |
| Provisions affected / original wording | Present in Act text and Constitution footnotes | No dedicated field; summarize only what is verified in `summary` |
| Official source reference | Available (official PDF/Gazette URLs) | Store provenance in the ingestion manifest, not in browser-facing API; add a field only if a future UI displays it |
| Current legal status | Partially derivable (44th/88th not fully in force; 106th in force 16-4-2026 but reservation deferred by art. 334A(1)) | Do not store as a boolean; too nuanced for current UI |

---

## 5. Missing data and functionality

1. **All amendment data is missing:** live `Amendment` table has 0 rows; consequently timeline, detail, hero cards, "Other Amendments" and citation verification have no data.
2. **No ingestion mechanism:** no seed script, no data file, no importer; the documented plan in `docs/update-prisma-migration.md:9` was never implemented.
3. **Article linkage cannot render:** detail fetches `/api/articles/{ref}` but `Article` has 0 rows; even a perfectly ingested amendment will show no "Related Articles" unless referenced articles exist. `relatedArticles` must be stored as slugs.
4. **Ordering is not chronological by content:** public/admin lists order by `createdAt` (insertion order), not by amendment ordinal/year. If ingestion inserts out of order, the "chronological journey" breaks.
5. **Empty/error states are weak:** list and home hero have no empty state; list and detail ignore non-OK responses; these are existing UI limitations to preserve, not redesign.
6. **Static counts/text:** footer `"106+"` and hero `"106 Amendments"`/quick-reference text are hardcoded and will not reflect the ingested dataset.
7. **Admin cannot edit `whyItMatters`/`relatedArticles`:** values exist in state and API but have no form inputs; ingestion must set them directly.
8. **Duplicate protection absent:** no unique constraint on `number`; repeated ingestion would create duplicate records and duplicate slugs.
9. **No functional amendment tests:** existing `generator/tests/*` and `test/test-ep.js` are security/smoke tests only; `package.json:5-11` has no `test` script.

---

## 6. Exact proposed database changes, if necessary

**Required content fields: none.** The existing `Amendment` model already covers every field the UI renders. Do not add assent/commencement/Act-number/status/source fields.

**One small, genuinely required integrity change (optional pending approval):**

```prisma
model Amendment {
  // ...existing fields unchanged...
  @@unique([number])
}
```

plus a migration creating the unique index on `Amendment(number)` (e.g. `prisma/migrations/<timestamp>_amendment_number_unique/migration.sql` with `CREATE UNIQUE INDEX "Amendment_number_key" ON "Amendment"("number");`). This makes ingestion idempotent and prevents duplicate ordinals/slugs. The live table is empty, so the index can be created safely; if any deployment has duplicates, they must be resolved before applying.

**Explicitly not proposed:** new models, new relations to `Article`/`Part`/`Clause`/`Schedule`, new content columns, type changes to `year`, destructive deletes, table rebuilds. Related articles remain the existing soft-link string field, preserving current frontend behavior.

---

## 7. Exact API and service changes

All changes extend existing files; no parallel module or endpoint is created.

1. `app/api/amendments/route.ts:37-39` — change ordering to a deterministic chronological order derived from stored data (numeric ordinal parsed from `number`, tie-break `year`) instead of `createdAt`, so the timeline is correct regardless of insertion order. Keep security middleware, `?q=` validation behavior and the bare-array response unchanged (no UI sends `q`; do not add filtering that no UI exposes).
2. `app/api/amendments/[slug]/route.ts:11-17` — normalize the incoming slug (`trim().toLowerCase()`) and match against normalized `number` so list/home/detail slug generation always resolves. Keep 404 `{error:"Amendment not found"}` and the bare-object response; do not change the route shape.
3. `app/api/random_amendments/route.ts:9-11` — keep as-is; `year` string ordering is adequate for 4-digit years, and randomization is intentionally client-side.
4. `app/api/admin/amendments/route.ts:16-30` and `[id]/route.ts:5-30` — add lightweight validation for the six existing fields (required non-empty `number`, `year`, `title`, `summary`; normalized `number`; `relatedArticles` validated as comma-separated `article-*`/`schedule-*` slugs where applicable), map `P2002` duplicate to `409 {error:"Amendment number already exists"}`, and map missing-id `P2025` to `404`. Keep response wrappers `{amendment}`/`{amendments}`/`{success:true}`, `proxy.ts` auth, and existing 500 logging convention. Use conditional spreads (pattern from `app/api/admin/articles/[id]/route.ts:19-42`) in PUT so partial updates do not erase `whyItMatters`/`relatedArticles`.
5. No new service/repository layer is introduced: ingestion validation is a shared helper used by the ingestion script and the admin routes, placed alongside existing data code (exact filename to be confirmed at implementation time, e.g. `lib/amendments/validation.ts`). It must be usable server-side only.
6. `lib/verification.ts:190-306` — no schema change needed; it continues to match `number`/`year` and use `summary`/`title`. Verify with populated data that citations still resolve; do not rewrite it unless a concrete regression appears.

---

## 8. Data ingestion and validation strategy

### 8.1 Authoritative sources actually investigated

| Source | URL | Status / use |
| --- | --- | --- |
| Legislative Department document registry (amendment Acts, SORs) | `https://www.legislative.gov.in/documents/constitution-of-india/the-constitution-amendment-acts-YTM2EjMtQWa?pageTitle=The-Constitution-(Amendment)-Acts` | Fetched via text proxy; 114 documents covering ordinals 1–106 plus SORs; direct fetch returned empty HTML |
| Legislative Department dashboard ("including SOR", with commencement dates) | `https://lddashboard.legislative.gov.in/amendment-acts` | Direct transport failed; content available only via search-index excerpts — treat dates from this source as **unconfirmed** until directly fetched |
| eGazette, 106th Amendment Act | `https://egazette.gov.in/WriteReadData/2023/249053.pdf` | Fetched via proxy; assent 28 Sep 2023; §1(2) commencement by notification; arts. 239AA, 330A, 332A, 334A |
| eGazette, 106th commencement notification | `https://egazette.gov.in/WriteReadData/2026/271834.pdf` | Fetched via proxy; S.O. 1922(E), 16 Apr 2026 |
| Legislative Department Act PDFs (sampled: 1st, 24th, 42nd, 73rd, 91st, 101st) | e.g. `https://www.legislative.gov.in/static/uploads/2025/07/f3789482ad0dfee795e54fb88c0401e6.pdf` (1st), `.../2a321e3e1deabf4a8e1b878b640414d7.pdf` (24th), `.../9f820a53b6e6840a459bde27eb5d24e5.pdf` (42nd), `.../d6e04624ef8b6b869af003909507cfe6.pdf` (73rd), `.../a4250c5ad613af2f4f9347ef45add1db.pdf` (101st) | Parsed by search provider; assent date in bracketed heading, SOR appended, provisions in section text |
| NDA/PIB press release (99th–106th list) | `https://www.pib.gov.in/PressReleasePage.aspx?PRID=2289474&reg=48&lang=2` | Fetched directly; corroborates 99th–106th |
| Copyright/reuse terms | `https://www.legislative.gov.in/policies/copyright-policy`, `https://indiacode.gov.in/info/copyright-policy`, `https://indiacode.gov.in/info/term-of-use` | Fetched via proxy; reproduction requires permission/attribution; India Code forbids systematic scraping/API redistribution |

### 8.2 Verified facts and discrepancies (no fabrication)

- Officially, **106 amendments** exist: 1st (1951) through 106th (2023). The Legislative Department 2026 Constitution preface says it incorporates all amendments up to the 106th; PIB (25 Jul 2026) lists 99th–106th. A 131st Amendment **Bill** (2026) is not an Act; no 107th Act was verified.
- Official title format: `The Constitution (<ordinal in words> Amendment) Act, <year>`. Store `number` as the compact ordinal (`1st`, `24th`, `42nd`, `73rd`, `101st`, `106th`) because the UI slug is derived from it.
- Verified samples: 1st assent 18-6-1951 (art. 15(4), 19(2)/(6), 31A/31B, Ninth Schedule, arts. 85/87/174/176/341/342/372/376); 24th assent 5-11-1971 (art. 13(4), art. 368 restructured); 42nd assent 18-12-1976 with split commencement (3-1-1977 / 1-2-1977 / 1-4-1977) and Preamble changes; 73rd assent 20-4-1993, commenced 24-4-1993 (Part IX); 101st assent 8-9-2016 (GST, arts. 246A etc., provisions w.e.f. 16-9-2016); 106th assent 28-9-2023, commenced 16-4-2026 (S.O. 1922(E)).
- Discrepancies requiring per-record verification: SOR headings sometimes name a different Bill number (42nd Act ← "Forty-fourth Amendment Bill, 1976"); registry titles have typos/variant ordinals and unreliable "Published Year" values; National Portal's old "came into force = date of assent" text conflicts with Act §1(2) for 101st. Do not copy from secondary sources.
- **Act numbers were not verified** from any successfully fetched official source and must not be invented. Assent/commencement dates exist but are not stored (see §4).

### 8.3 Ingestion design (to implement only after approval)

1. Introduce a versioned, human-reviewable source manifest (e.g. `data/amendments/verified-amendments.json`) containing **only** the seven UI fields per record plus `sourceUrl` and `sourceNotes` for provenance. Provenance stays server-side; the public API returns only the seven fields.
2. Populate records incrementally: no record is added unless its title, year, summary and `whyItMatters` can be tied to an official source URL in the manifest. For amendments whose full text cannot be fetched/verified, either omit them or include only the verified title/year with an empty summary and an explicit `sourceNotes` marker — never invent a summary.
3. Validate before insert/update: required fields non-empty (except `whyItMatters`/`relatedArticles`), canonical ordinal format, 4-digit year, official title matches the source, `relatedArticles` only contains slugs resolvable by `app/api/articles/[slug]/route.ts:4-13`, and no duplicate `number`.
4. Idempotency: upsert keyed on `number` (backed by the proposed unique index) or skip-if-present when no migration is approved. Re-running ingestion must not create duplicates or change deliberately curated admin edits unless explicitly requested.
5. Apply via a script using the existing libSQL client pattern (`lib/prisma.ts` / `scripts/apply-turso-schema.mjs`), with a dry-run mode that prints planned inserts/updates and fails on validation errors before any write.
6. Respect reuse terms: attribute Legislative Department/India Code in the manifest; do not bulk-scrape India Code; do not expose source tokens or `.env` values to the browser.

---

## 9. Required frontend integration changes

Keep all layouts, styling, components, animations and interactions. Changes are content-wiring only:

1. No TypeScript interface changes are required: the backend already returns the seven fields the UI consumes. Keep the defensive array/wrapper normalization in list/detail.
2. After ingestion is verified, replace hardcoded amendment counts (`components/Footer.tsx:107` `"106+"`, `components/ConstitutionHero.tsx:572` `"106 Amendments"`) with a count derived from the existing `/api/amendments` or `/api/random_amendments` response, preserving identical markup and text style. Only do this after the endpoint returns the verified dataset.
3. Review `components/ConstitutionHero.tsx:189` hardcoded "Recent Amendments" quick-reference text. Either verify each statement against an official source in the manifest or derive the same text from DB records; do not leave unverified claims presented as current data.
4. Do **not** add search/filter/sort/pagination — the existing UI has none and the task forbids redesign. Keep the inert `?q=` behavior in the API as-is.
5. Do not add admin form inputs for `whyItMatters`/`relatedArticles` unless separately approved; ingestion sets these fields directly.
6. Leave `const era = ...` in the list page (`:65`) unused; do not alter the visual era/color logic.
7. No secrets or backend configuration in client code; source URLs in the manifest are server-side only.

---

## 10. Potential risks and regression areas

- **Chatbot citation verification:** `lib/verification.ts:220-300` matches `amendment.number` exactly and uses `year` as a string comparison. Canonical `number` formatting and correct `year` are essential; test "42nd Amendment" and "106th Amendment" queries after ingestion.
- **Related articles:** with `Article` empty, detail pages will silently drop the "Related Articles" section. Decide explicitly: (a) ingest only the verified Article rows referenced by amendment slugs, or (b) accept the empty section as the existing unavailable state. Option (a) touches article data but not the Article model or UI; it still requires approval.
- **Slug normalization:** home `amendmentNumberToSlug` (`ConstitutionHero.tsx:203-205`) lacks trim/null guards, unlike list/detail. Canonical stored `number` values avoid this; do not change UI helpers.
- **Ordering:** `createdAt` ordering would scramble the timeline if records are inserted out of order; API-side ordinal ordering is the mitigation.
- **Unique index:** if any environment already has duplicate `number` rows, migration fails. Live DB is empty, but staging/production must be checked first.
- **Migration mechanism mismatch:** production has no `_prisma_migrations`; `migration_lock.toml` says postgresql while schema says sqlite. A new migration must be applied deliberately (manual SQL via the libSQL client or a documented `db:init:turso` path), not assumed to run via `prisma migrate deploy`.
- **No destructive DB operations:** do not delete/rebuild the `Amendment` table or any unrelated table; do not drop the `Article` table.
- **Baseline lint:** prior `npm run lint` run in this workspace reports 7 pre-existing errors unrelated to amendments (socketio route, hooks, prisma runner, two test files) and many pre-existing warnings. Evaluate lint against that baseline rather than treating it as a new regression.
- **Stale generated Next types:** deleting/adding route files requires clearing `.next/types` and `.next/dev/types` before `tsc --noEmit`/build; no route files are planned to be deleted here.

---

## 11. Migration and rollback strategy

1. Pre-flight (read-only): confirm `Amendment` row count, check for duplicate `number` values, confirm presence/absence of `_prisma_migrations`, and back up any existing rows.
2. Schema change (only if §6 approved): add `@@unique([number])` to `prisma/schema.prisma:102-112` and a new migration SQL file; run `npx prisma validate`, `npx prisma generate`.
3. Apply the unique index on any environment that has tables but no migration tracking via an explicit, documented libSQL SQL execution; on fresh databases it is produced by `npm run db:init:turso`.
4. Data load: run the ingestion script in dry-run mode first, then write mode. Ingestion is additive/upsert only; no deletes.
5. Rollback:
   - Data: the script records each inserted/updated `id` and prior values in a log; restore by deleting only inserted ids and re-applying recorded prior values (no table drop). No production data exists today, so rollback is trivial.
   - Schema: drop only the new unique index (`DROP INDEX "Amendment_number_key"`) and revert the `@@unique` line; the `Amendment` table and all other tables remain untouched.
6. No rollback of frontend files is expected (content-wiring only); revert the specific commits if approved changes must be undone.

---

## 12. Testing strategy

Commands/checks to run after approval (baseline: no code has been changed):

- `npx prisma validate` and `npx prisma generate`.
- Read-only DB verification: `SELECT COUNT(*) FROM Amendment`, `SELECT number, year, title FROM Amendment ORDER BY ...`, duplicate check `SELECT number, COUNT(*) ... HAVING COUNT(*) > 1`.
- `curl /api/amendments`, `curl /api/amendments/42nd`, `curl /api/amendments/106th`, `curl /api/random_amendments`; assert 200, array/object shapes, exact seven-field payload, chronological order and no secrets.
- `curl /api/amendments/does-not-exist` → 404 `{error:"Amendment not found"}`; `curl /api/amendments/42ND` resolves after normalization; invalid admin payloads → 400/409; missing admin id → 404 (if §7 approved).
- Ingest twice and assert row count unchanged (idempotency).
- Manual UI verification (no redesign): timeline cards render year/number/title/summary/whyItMatters/related-article chips; detail loads, "Other Amendments" lists the rest, article links resolve when article data exists; home hero shows 4 cards; empty DB still shows the existing skeletons/empty timeline without crashing.
- Chatbot regression: run classification/benchmark checks that mention amendments (`test/classification-tests.js`, `test/quick-test.js`, `lib/goldenBenchmark.ts` via existing evaluation flow) and verify citation verification still matches the 42nd/106th records.
- `npm run lint` (compare to 7-error baseline), `npx tsc --noEmit`, `npm run build`; clear stale `.next/types` and `.next/dev/types` first if route files change.
- Security regression: existing generator tests (`generator/tests/sql-injection.js`, `ddos-simulation.js`, `bot-detection.js`) still hit `/api/amendments`; confirm middleware behavior is unchanged.

---

## Approval gate

No implementation files have been created or modified. Please review this plan and explicitly approve it (including the optional unique index in §6 and the related-article decision in §10) before any Phase 5 work begins.
