#!/usr/bin/env python3
"""
Scrape AWS exam questions from cloud.bestpractice247.com -> data/<exam>/scraped.json

Usage:
    pip install requests beautifulsoup4
    python scrape_exam.py                       # default: saa-c03
    python scrape_exam.py clf-c02               # scrape Cloud Practitioner
    python scrape_exam.py saa-c03 --pages 5     # debug: only first 5 pages
    python scrape_exam.py --topic <full-slug>   # any topic by full URL slug
    python scrape_exam.py --out custom.json     # override output path

Notes:
- Each list page renders 10 questions.
- The "correct answer" is NOT in the static HTML. The Solution/ChatGPT/Gemini
  buttons reveal answers via JavaScript, so this scraper captures questions,
  options, accuracy %, and vote count only. To grab answers you'd need a
  headless browser (Playwright/Selenium) and to click "Solution" per question.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

SITE = "https://cloud.bestpractice247.com"

# Registry of known exams: short code -> (full topic slug, display name)
EXAMS: dict[str, dict] = {
    "saa-c03": {
        "slug": "amazon-aws-certified-solutions-architect-associate-saa-c03",
        "name": "Amazon AWS Certified Solutions Architect - Associate SAA-C03",
    },
    "clf-c02": {
        "slug": "amazon-aws-certified-cloud-practitioner-clf-c02",
        "name": "Amazon AWS Certified Cloud Practitioner CLF-C02",
    },
    "sap-c02": {
        "slug": "amazon-aws-certified-solutions-architect-professional-sap-c02",
        "name": "Amazon AWS Certified Solutions Architect - Professional SAP-C02",
    },
    "dva-c02": {
        "slug": "amazon-aws-certified-developer-associate-dva-c02",
        "name": "Amazon AWS Certified Developer - Associate DVA-C02",
    },
    "soa-c02": {
        "slug": "amazon-aws-certified-sysops-administrator-associate-soa-c02",
        "name": "Amazon AWS Certified SysOps Administrator - Associate SOA-C02",
    },
    "dop-c02": {
        "slug": "amazon-aws-certified-devops-engineer-professional-dop-c02",
        "name": "Amazon AWS Certified DevOps Engineer - Professional DOP-C02",
    },
}

QUESTION_HEADER_RE = re.compile(
    r"#(\d+)\s*\(Accuracy:\s*(\d+)%\s*/\s*(\d+)\s*votes?\)",
    re.IGNORECASE,
)
OPTION_RE = re.compile(r"^([A-Z])\.\s*(.+)$")


def topic_url(slug: str) -> str:
    return f"{SITE}/topics/{slug}"


def fetch_page(url: str, session: requests.Session, retries: int = 3) -> str:
    """Fetch one URL; returns raw HTML."""
    last_err = None
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=30, headers={
                "User-Agent": "Mozilla/5.0 (scraper)",
            })
            r.raise_for_status()
            return r.text
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url} failed after {retries} retries: {last_err}")


def detect_total_pages(html: str) -> int:
    """Find the highest ?page=N referenced in pagination links."""
    soup = BeautifulSoup(html, "html.parser")
    max_page = 1
    for a in soup.find_all("a", href=True):
        m = re.search(r"[?&]page=(\d+)", a["href"])
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


def extract_question_blocks(html: str) -> list[dict]:
    """Parse one list page's HTML into a list of question dicts.

    Strategy: each question is rendered as a block. We pull all visible text,
    locate question headers via regex, slice between headers, then split each
    block into (question_body, options) by looking for lines starting with
    'A.', 'B.', 'C.', etc.
    """
    soup = BeautifulSoup(html, "html.parser")

    for sel in ("script", "style", "noscript", "nav", "header", "footer"):
        for el in soup.find_all(sel):
            el.decompose()

    text = soup.get_text("\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    headers = list(QUESTION_HEADER_RE.finditer(text))
    questions = []
    for i, m in enumerate(headers):
        qnum = int(m.group(1))
        accuracy = int(m.group(2))
        votes = int(m.group(3))
        start = m.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        block = text[start:end]

        lines = [ln.strip() for ln in block.split("\n")]
        question_lines: list[str] = []
        options: dict[str, str] = {}
        current_letter: str | None = None
        stop_markers = {"Solution", "ChatGPT", "Gemini"}

        for ln in lines:
            if not ln:
                if current_letter is None and question_lines:
                    question_lines.append("")
                continue
            if ln in stop_markers:
                current_letter = None
                continue
            opt_match = OPTION_RE.match(ln)
            if opt_match:
                letter = opt_match.group(1)
                body = opt_match.group(2).strip()
                options[letter] = body
                current_letter = letter
                continue
            if current_letter is not None:
                options[current_letter] = (options[current_letter] + " " + ln).strip()
            else:
                question_lines.append(ln)

        question_text = "\n".join(question_lines).strip()
        if not question_text or not options:
            continue

        questions.append({
            "number": qnum,
            "accuracy_percent": accuracy,
            "votes": votes,
            "question": question_text,
            "options": options,
        })

    return questions


def resolve_exam(exam_code: str | None, topic_slug: str | None) -> tuple[str, str, str]:
    """Return (short_code, slug, display_name)."""
    if topic_slug:
        # Derive a short code from the slug's tail (e.g. "...-saa-c03" -> "saa-c03")
        tail = topic_slug.rsplit("-", 2)[-2:]
        short = "-".join(tail) if len(tail) == 2 else topic_slug
        name = topic_slug.replace("-", " ").title()
        return short, topic_slug, name
    code = (exam_code or "saa-c03").lower()
    if code not in EXAMS:
        raise SystemExit(
            f"Unknown exam '{code}'. Known: {', '.join(EXAMS)}. "
            f"Or pass --topic <full-slug>."
        )
    return code, EXAMS[code]["slug"], EXAMS[code]["name"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("exam", nargs="?", default="saa-c03",
                    help=f"exam short code (default saa-c03). Known: {', '.join(EXAMS)}")
    ap.add_argument("--topic", default=None,
                    help="full topic URL slug (overrides exam code)")
    ap.add_argument("--pages", type=int, default=None,
                    help="max pages to fetch (default: auto-detect from page 1)")
    ap.add_argument("--workers", type=int, default=8,
                    help="parallel HTTP workers (default 8)")
    ap.add_argument("--out", default=None,
                    help="output file path (default data/<exam>/scraped.json)")
    args = ap.parse_args()

    short, slug, exam_name = resolve_exam(args.exam, args.topic)
    base = topic_url(slug)
    out_path = args.out or f"data/{short}/scraped.json"

    # Ensure parent dir exists when using the default per-exam layout.
    import os
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    session = requests.Session()

    if args.pages is None:
        print(f"Detecting page count for {short}...", file=sys.stderr)
        first_html = fetch_page(f"{base}?page=1", session)
        total_pages = detect_total_pages(first_html)
        print(f"  detected {total_pages} pages", file=sys.stderr)
        pages_html: dict[int, str] = {1: first_html}
        page_range = list(range(2, total_pages + 1))
    else:
        total_pages = args.pages
        pages_html = {}
        page_range = list(range(1, total_pages + 1))

    print(f"Fetching {len(page_range)} pages with {args.workers} workers...",
          file=sys.stderr)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(fetch_page, f"{base}?page={p}", session): p
            for p in page_range
        }
        for fut in as_completed(futures):
            p = futures[fut]
            try:
                pages_html[p] = fut.result()
                print(f"  page {p:>3} ok", file=sys.stderr)
            except Exception as e:
                print(f"  page {p:>3} FAILED: {e}", file=sys.stderr)

    all_questions: list[dict] = []
    seen: set[int] = set()
    for p in sorted(pages_html):
        for q in extract_question_blocks(pages_html[p]):
            if q["number"] in seen:
                continue
            seen.add(q["number"])
            all_questions.append(q)

    all_questions.sort(key=lambda q: q["number"])

    payload = {
        "source": base,
        "exam": exam_name,
        "exam_code": short,
        "total": len(all_questions),
        "note": (
            "Correct answers are not included; the site reveals them via "
            "JavaScript ('Solution' / 'ChatGPT' / 'Gemini' buttons) and the "
            "answer text is not present in the static HTML."
        ),
        "questions": all_questions,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(all_questions)} questions to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
