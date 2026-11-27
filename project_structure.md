# 📁 knowsamvidhan - Project Structure

*Generated on: 5/3/2026, 12:17:44 PM*

## 📋 Quick Overview

| Metric | Value |
|--------|-------|
| 📄 Total Files | 119 |
| 📁 Total Folders | 87 |
| 🌳 Max Depth | 5 levels |
| 🛠️ Tech Stack | React, Next.js, TypeScript, CSS, Node.js |

## ⭐ Important Files

- 🟡 🚫 **.gitignore** - Git ignore rules
- 🔵 🔍 **eslint.config.mjs** - ESLint config
- 🟡 ▲ **next.config.ts** - Next.js config
- 🟡 🔒 **package-lock.json** - Dependency lock
- 🔴 📦 **package.json** - Package configuration
- 🔴 📖 **README.md** - Project documentation
- 🟡 🔷 **tsconfig.json** - TypeScript config

## 📊 File Statistics

### By File Type

- 🔷 **.ts** (TypeScript files): 44 files (37.0%)
- ⚛️ **.tsx** (React TypeScript files): 43 files (36.1%)
- 📄 **.sql** (Other files): 6 files (5.0%)
- 🎨 **.svg** (SVG images): 5 files (4.2%)
- 🖼️ **.png** (PNG images): 5 files (4.2%)
- 📖 **.md** (Markdown files): 4 files (3.4%)
- ⚙️ **.json** (JSON files): 3 files (2.5%)
- 📄 **.mjs** (Other files): 2 files (1.7%)
- 🚫 **.gitignore** (Git ignore): 1 files (0.8%)
- 🖼️ **.ico** (Icon files): 1 files (0.8%)
- 🎨 **.css** (Stylesheets): 1 files (0.8%)
- 📄 **.** (Other files): 1 files (0.8%)
- ⚙️ **.toml** (TOML files): 1 files (0.8%)
- 📄 **.prisma** (Other files): 1 files (0.8%)
- 📄 **.mp4** (Other files): 1 files (0.8%)

### By Category

- **TypeScript**: 44 files (37.0%)
- **React**: 43 files (36.1%)
- **Assets**: 11 files (9.2%)
- **Other**: 11 files (9.2%)
- **Docs**: 4 files (3.4%)
- **Config**: 4 files (3.4%)
- **DevOps**: 1 files (0.8%)
- **Styles**: 1 files (0.8%)

### 📁 Largest Directories

- **root**: 119 files
- **app**: 75 files
- **app\api**: 36 files
- **app\api\admin**: 20 files
- **app\(user)**: 18 files

## 🌳 Directory Structure

```
knowsamvidhan/
├── 🟡 🚫 **.gitignore**
├── 📖 AGENTS.md
├── 🚀 app/
│   ├── 📂 (admin)/
│   │   ├── 📂 activity-logs/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 ad-dashboard/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 admin_profile/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 admin-xyz/
│   │   │   ├── 📂 forgot-password/
│   │   │   │   └── ⚛️ page.tsx
│   │   │   ├── ⚛️ page.tsx
│   │   │   └── 📂 verify-otp/
│   │   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 alerts/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 amendments/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 analytics/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 articles/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 clauses/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 parts/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 quizzes/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 schedules/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 settings/
│   │   │   └── ⚛️ page.tsx
│   │   └── 📂 users/
│   │   │   └── ⚛️ page.tsx
│   ├── 📂 (user)/
│   │   ├── ⚛️ layout.tsx
│   │   ├── 📂 logout/
│   │   │   └── ⚛️ page.tsx
│   │   ├── ⚛️ page.tsx
│   │   ├── 📂 signup/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_amendments/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── ⚛️ page.tsx
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_articles/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── ⚛️ page.tsx
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_chat/
│   │   │   ├── ⚛️ layout.tsx
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_login/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_parts/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── ⚛️ page.tsx
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_preamble/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_profile/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📂 user_quiz/
│   │   │   └── ⚛️ page.tsx
│   │   └── 📂 user_schedules/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── ⚛️ page.tsx
│   │   │   └── ⚛️ page.tsx
│   ├── 🔌 api/
│   │   ├── 📂 admin/
│   │   │   ├── 📂 amendments/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 articles/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 clauses/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 forgot-password/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 login/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 logout/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 parts/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 quizzes/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 reset-password/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 schedules/
│   │   │   │   ├── 📂 [id]/
│   │   │   │   │   └── 🔷 route.ts
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 send-otp/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 users/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 📂 verify-otp/
│   │   │   │   └── 🔷 route.ts
│   │   ├── 📂 amendments/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 🔷 route.ts
│   │   ├── 📂 articles/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 🔷 route.ts
│   │   ├── 📂 auth/
│   │   │   ├── 📂 login/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 logout/
│   │   │   │   └── 🔷 route.ts
│   │   │   ├── 📂 profile/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 📂 register/
│   │   │   │   ├── 🔷 route.ts
│   │   │   │   └── 📂 verify/
│   │   │   │   │   └── 🔷 route.ts
│   │   ├── 📂 feedback/
│   │   │   └── 🔷 route.ts
│   │   ├── 📂 parts/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 🔷 route.ts
│   │   ├── 📂 preamble/
│   │   │   └── 🔷 route.ts
│   │   ├── 📂 schedules/
│   │   │   ├── 📂 [slug]/
│   │   │   │   └── 🔷 route.ts
│   │   │   └── 🔷 route.ts
│   │   └── 📂 tts/
│   │   │   └── 🔷 route.ts
│   ├── 🎨 globals.css
│   ├── ⚛️ layout.tsx
│   └── 📂 reset-password/
│   │   └── ⚛️ page.tsx
├── 📖 CLAUDE.md
├── 🧩 components/
│   ├── ⚛️ AIVideo.tsx
│   ├── ⚛️ ConstitutionHero.tsx
│   ├── ⚛️ Footer.tsx
│   ├── ⚛️ Navbar.tsx
│   ├── ⚛️ Profile.tsx
│   └── ⚛️ speak.tsx
├── 🔵 🔍 **eslint.config.mjs**
├── 📚 lib/
│   ├── 🔷 auth.ts
│   ├── 🔷 email.ts
│   ├── 🔷 gemini.ts
│   ├── 🔷 prisma.ts
│   └── 🔷 profile.ts
├── 📄 LICENSE
├── 🔷 proxy.ts
├── 🔷 next-env.d.ts
├── 🟡 ▲ **next.config.ts**
├── 🟡 🔒 **package-lock.json**
├── 🔴 📦 **package.json**
├── 📄 postcss.config.mjs
├── 📂 prisma/
│   ├── 📂 migrations/
│   │   ├── 📂 20260430173542_init/
│   │   │   └── 📄 migration.sql
│   │   ├── 📂 20260430175902_fix_preamble_structure/
│   │   │   └── 📄 migration.sql
│   │   ├── 📂 20260501115626_add_schedule_slug_tagdetails/
│   │   │   └── 📄 migration.sql
│   │   ├── 📂 20260501131410_quiz_update/
│   │   │   └── 📄 migration.sql
│   │   ├── 📂 20260502000000_add_registration_otp/
│   │   │   └── 📄 migration.sql
│   │   ├── 📂 20260502010000_add_feedback/
│   │   │   └── 📄 migration.sql
│   │   └── ⚙️ migration_lock.toml
│   └── 📄 schema.prisma
├── 📖 project_structure.md
├── 🌐 public/
│   ├── 📄 ai-avatar.mp4
│   ├── 🎨 file.svg
│   ├── 🎨 globe.svg
│   ├── 📂 image/
│   │   ├── 🖼️ ashoka.png
│   │   ├── 🖼️ avatar.png
│   │   ├── 🖼️ book.png
│   │   ├── 🖼️ logo.png
│   │   └── 🖼️ quiz.png
│   ├── 🎨 next.svg
│   ├── 🎨 vercel.svg
│   └── 🎨 window.svg
├── 🔴 📖 **README.md**
└── 🟡 🔷 **tsconfig.json**
```

## 📖 Legend

### File Types
- 🚫 DevOps: Git ignore
- 📖 Docs: Markdown files
- ⚛️ React: React TypeScript files
- 🔷 TypeScript: TypeScript files
- 🖼️ Assets: Icon files
- 🎨 Styles: Stylesheets
- 📄 Other: Other files
- ⚙️ Config: JSON files
- ⚙️ Config: TOML files
- 🎨 Assets: SVG images
- 🖼️ Assets: PNG images

### Importance Levels
- 🔴 Critical: Essential project files
- 🟡 High: Important configuration files
- 🔵 Medium: Helpful but not essential files
