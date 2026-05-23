#!/usr/bin/env python3
"""
Parse uncertain-answer notes (free-form text, one entry per line) into
data/<exam>/uncertain.json so the web app can flag those questions as
"double-check this".

Input line format (best-effort regex; lines that don't fit get a null pick):
    Q<n> (...short tag...) — picked <X>  or  [X, Y]  — <reasoning>
    Q<n> ...assumes/picks (X)...

Usage:
    python parse_uncertain.py                 # convert all data/*/uncertain.txt
    python parse_uncertain.py path/to.txt --exam saa-c03 --out data/saa-c03/uncertain.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

QNUM_RE = re.compile(r"^\s*Q(\d+)\b", re.IGNORECASE)

# Look for picked answers in order of specificity:
#   "picked [A, B]"  /  "went with [A, B]"
#   "picked A"       /  "went with A"  /  "picks A"
#   "(A)"            as a last resort
MULTI_RE = re.compile(
    r"(?:picked|went with|picks)\s*\[([A-H](?:\s*,\s*[A-H])+)\]",
    re.IGNORECASE,
)
SINGLE_RE = re.compile(
    r"(?:picked|went with|picks)\s+([A-H])\b",
    re.IGNORECASE,
)
PAREN_RE = re.compile(r"\(([A-H])\)")


def extract_pick(line: str) -> str | list[str] | None:
    m = MULTI_RE.search(line)
    if m:
        letters = [s.strip().upper() for s in m.group(1).split(",")]
        return sorted(set(letters))
    m = SINGLE_RE.search(line)
    if m:
        return m.group(1).upper()

    # Look at the part after the em-dash (the explanation half of the line).
    tail = line.split("—", 1)[-1].strip() if "—" in line else line

    # Bracketed multi at start of the tail: "[A, B] ..."
    m = re.match(r"\[([A-H](?:\s*,\s*[A-H])+)\]", tail)
    if m:
        letters = [s.strip().upper() for s in m.group(1).split(",")]
        return sorted(set(letters))

    # Standalone single letter at start of the tail: "A ..." or "A."
    m = re.match(r"([A-H])\b", tail)
    if m:
        return m.group(1).upper()

    # Last resort: first "(X)" group inside the tail.
    m = PAREN_RE.search(tail)
    if m:
        return m.group(1).upper()
    return None


def parse_lines(text: str) -> list[dict]:
    items: list[dict] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = QNUM_RE.match(line)
        if not m:
            continue
        items.append({
            "number": int(m.group(1)),
            "picked": extract_pick(line),
            "note": line,
        })
    return items


def convert_file(txt_path: Path, exam_code: str, out_path: Path) -> int:
    text = txt_path.read_text(encoding="utf-8")
    items = parse_lines(text)
    payload = {
        "exam_code": exam_code,
        "note": (
            "Questions where the chosen answer is uncertain — double-check "
            "before relying on these. `picked` is the best-guess answer; "
            "`note` is the original reasoning."
        ),
        "items": items,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(items)


def discover_pairs(root: Path) -> list[tuple[Path, str, Path]]:
    """Scan `data/` for legacy flat layout (questions_<exam>.txt or
    questions_<exam>_note.txt) and yield (txt, exam_code, out_json_path).
    """
    pairs: list[tuple[Path, str, Path]] = []
    for p in sorted(root.glob("questions_*.txt")):
        stem = p.stem  # questions_<exam> or questions_<exam>_note
        m = re.match(r"questions_(.+?)(?:_note)?$", stem)
        if not m:
            continue
        exam = m.group(1)
        out = root / exam / "uncertain.json"
        pairs.append((p, exam, out))
    # Also support already-grouped layout: data/<exam>/uncertain.txt
    for p in sorted(root.glob("*/uncertain.txt")):
        exam = p.parent.name
        out = p.parent / "uncertain.json"
        pairs.append((p, exam, out))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("txt", nargs="?", help="single .txt to convert")
    ap.add_argument("--exam", help="exam code (required with single .txt)")
    ap.add_argument("--out", help="output json path (required with single .txt)")
    ap.add_argument("--data", default="data", help="data root (default: data)")
    args = ap.parse_args()

    if args.txt:
        if not args.exam or not args.out:
            sys.exit("--exam and --out are required when converting a single file")
        n = convert_file(Path(args.txt), args.exam, Path(args.out))
        print(f"wrote {n} items -> {args.out}", file=sys.stderr)
        return

    root = Path(args.data)
    pairs = discover_pairs(root)
    if not pairs:
        print(f"no .txt files found under {root}/", file=sys.stderr)
        return
    for txt, exam, out in pairs:
        n = convert_file(txt, exam, out)
        print(f"  {exam:8s} {txt.name:40s} -> {out} ({n} items)", file=sys.stderr)


if __name__ == "__main__":
    main()
