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

## Data files

The app expects files under `data/<exam>/`:

- `questions.json` (required) — bank with inline `answer` field (string for single-select, array for multi-select). Missing `answer` means that question runs in self-review mode.
- `scraped.json` (optional) — raw scraper output, no answers.
- `uncertain.json` (optional) — flagged questions where the chosen answer is uncertain. Parsed from `uncertain.txt` via [parse_uncertain.py](parse_uncertain.py).
