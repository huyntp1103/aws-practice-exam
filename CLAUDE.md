# aws-study

Personal project for studying AWS certification exams. Two parts: a Python scraper that builds question banks, and a React web app for practicing them.

## Project scope

- Pick an exam → answer questions → see results.
- Optional countdown timer (off by default, opt-in toggle).
- Persist answers + history locally (localStorage).
- Practice history across all exams, filterable by exam.
- Surface "uncertain answer" notes so the user can double-check questionable questions.
- Single-page app. No auth, no leaderboards, no multi-user, no backend.

## Layout

- [scrape_exam.py](scrape_exam.py) — scraper for cloud.bestpractice247.com. Registry of short codes (`saa-c03`, `clf-c02`, `sap-c02`, `dva-c02`, `soa-c02`, `dop-c02`) or `--topic <full-slug>`. Writes to `data/<exam>/scraped.json`.
- [parse_uncertain.py](parse_uncertain.py) — converts free-form `uncertain.txt` notes into `data/<exam>/uncertain.json`.
- `data/<exam>/` — one folder per exam:
  - `questions.json` — canonical bank. Each question has an inline `answer` field (string for single-select, array for multi-select); when missing, that question runs in self-review mode.
  - `scraped.json` — raw scraper output (no answers).
  - `uncertain.txt` / `uncertain.json` — flagged questions where the chosen answer is uncertain (free-form notes + parsed form).
- [src/](src/), [index.html](index.html), [vite.config.ts](vite.config.ts), [package.json](package.json) — Vite + React + TypeScript + Tailwind + shadcn/ui SPA at project root. See [README.md](README.md). Vite serves `data/` at the site root (`publicDir: './data'`), so the app fetches `/<exam>/questions.json` directly.
- [DESIGN.md](DESIGN.md) — visual + UX decisions. Read before changing colors, adding components, or repurposing semantic tokens.
- [.claude/design-refs/](.claude/design-refs/) — general shadcn + Tailwind reference cookbooks. Reference only; project-specific decisions live in DESIGN.md.

## Conventions

- All exam data lives under `data/<exam>/`. Don't reintroduce the legacy flat `data/questions_<exam>*.json` layout.
- Practice history is in `localStorage` (`aws-study:attempts:<exam>`); History page aggregates across exams. No server-side store.
- Project context goes in this file (or files under `.claude/`), **not** in `~/.claude/projects/.../memory/`.
