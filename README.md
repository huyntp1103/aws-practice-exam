# aws-study

Personal project for studying AWS certification exams: a Python scraper that builds question banks plus a React SPA for practicing them. See [CLAUDE.md](CLAUDE.md) for full project context and [DESIGN.md](DESIGN.md) for visual / UX decisions.

## Quick start

```bash
# Scrape a question bank (once per exam)
pip3 install requests beautifulsoup4
python3 scrape_exam.py saa-c03         # writes data/saa-c03/scraped.json

# Run the practice web
npm install
npm run dev                            # http://localhost:5173
npm run build                          # static output in dist/
```

Stack: Vite + React + TypeScript + Tailwind + shadcn/ui (lightweight subset). State in React + `localStorage`. Routing via `react-router`. Vite serves `data/` at the site root, so the app fetches `/<exam>/questions.json` directly.

## Features

- Pick exam from registry (matches `scrape_exam.py`).
- Modes: **Random N** or **Sequential** (resume supported).
- **Optional timer** (off by default) with countdown + auto-submit on expiry.
- Single- and multi-select questions (auto-detected from answer key).
- Flag for review · Reveal answer · Question jumper · "Double-check" notes for uncertain answers.
- Results: score, filter by incorrect / flagged / unanswered / double-check; expand for full breakdown.
- Practice history across all exams, filterable by exam, deletable.
- Light / dark theme toggle (light by default).
- All progress saved to `localStorage`, keyed per exam.

## Keyboard shortcuts (in session)

- `A`–`H` pick option
- `←` / `→` previous / next question
- `F` toggle flag
- `R` reveal answer (when answer key present)

## Password gate (light deterrent)

The app can be hidden behind a SHA-256 password check. The hash is baked into the bundle at build time via `VITE_PASSWORD_HASH`; the password itself never lives in the repo. Bypassable by anyone reading the JS, but enough to stop casual visitors.

**Generate the hash** (from a password you'll remember):

```bash
echo -n "your-password" | shasum -a 256 | cut -d' ' -f1
```

**Local dev** — copy `.env.example` to `.env.local` and paste the hash:

```ini
VITE_PASSWORD_HASH=<hex hash>
```

**Production (GitHub Pages)** — set a repo secret:

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `PASSWORD_HASH`, Value: the hex hash.
3. The deploy workflow passes it to the build as `VITE_PASSWORD_HASH`.

Leave the env var unset and the gate disables itself (open access). The build also logs a console warning in production if no hash is configured.

## Data files

The app expects files under `data/<exam>/`:

- `questions.json` (required) — bank with inline `answer` field (string for single-select, array for multi-select). Missing `answer` means that question runs in self-review mode.
- `scraped.json` (optional) — raw scraper output, no answers.
- `uncertain.json` (optional) — flagged questions where the chosen answer is uncertain. Parsed from `uncertain.txt` via [parse_uncertain.py](parse_uncertain.py).
