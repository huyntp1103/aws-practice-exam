#!/usr/bin/env python3
"""SAA-C03 review prioritizer.

Builds a scored list of questions to review from the practice-app history export,
stores it in review-data.json (editable), and renders review-top.md.

Usage (run from anywhere; always use `python3 -I`):
  python3 -I review.py sync [HISTORY_JSON]      ingest a new app export (idempotent), rescore, render
  python3 -I review.py log KEY right|wrong [--picked B,D] [--date YYYY-MM-DD]
                                               record a practice result done outside the app
  python3 -I review.py master KEY [--undo]      hide a question you are confident about
  python3 -I review.py note KEY "text"           attach a personal note (shown in the markdown)
  python3 -I review.py render [--top N]         rescore + re-render only (e.g. after editing the JSON)

KEY looks like `bonso:57` or `saa:68`. A duplicate's key resolves to the kept question.
"""
import argparse
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BANK_DIR = HERE.parent / "data"
DATA_FILE = HERE / "review-data.json"
MD_FILE = HERE / "review-top.md"
DEFAULT_HISTORY = Path.home() / "Downloads" / "aws-study-history.json"

BANKS = {"saa": "saa-c03", "bonso": "saa-c03-bonso"}
EXAM_CODE_TO_BANK = {
    "saa-c03-bonso": "bonso",
    "saa-c03": "saa",
    "Amazon AWS Certified Solutions Architect - Associate SAA-C03": "saa",
}

DEFAULT_CONFIG = {
    "half_life_days": 21,       # recency weight halves every N days since the last wrong answer
    "top_n": 40,                # questions shown in full in the markdown
    "w_first_wrong": 30,        # any wrong answer at all
    "w_extra_wrong": 12,        # each extra wrong answer (capped at 2 extra)
    "w_recency": 20,            # wrong recently (decays with half_life_days)
    "w_unresolved": 10,         # most recent attempt was wrong
    "w_streak_bonus": -10,      # each correct answer in a row after the last wrong (cap 3)
    "w_multi": 10,              # multiple-answer question ("choose two/three")
    "w_confusing": 15,          # correct option very similar to a wrong option
    "w_community": 8,           # low community accuracy (saa bank only)
    "confusion_floor": 0.35,    # option similarity below this = 0 confusion
    "confusion_ceil": 0.85,     # option similarity at/above this = full confusion points
}

STOP = set("""the a an of to and in for is on with that be by are as or which this it its from at will
should what company solutions architect use using used needs aws amazon requirements meet must most least
all each into their them then than can only not no new existing data""".split())


# ---------------------------------------------------------------- helpers
def toks(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP}


def jac(a, b):
    return len(a & b) / max(1, len(a | b))


def letters(x):
    if isinstance(x, list):
        return sorted(x)
    return sorted(c for c in str(x) if c.isalpha())


def today():
    return dt.date.today()


def load_banks():
    banks = {}
    for short, folder in BANKS.items():
        qs = json.load(open(BANK_DIR / folder / "questions.json"))["questions"]
        ex = json.load(open(BANK_DIR / folder / "explanations.json")).get("items", {})
        unc = {}
        p = BANK_DIR / folder / "uncertain.json"
        if p.exists():
            unc = {i["number"]: i for i in json.load(open(p)).get("items", [])}
        banks[short] = {
            q["number"]: {**q, "explanation": ex.get(str(q["number"]), {}).get("text"),
                          "uncertain": q["number"] in unc}
            for q in qs
        }
    return banks


def qget(banks, key):
    b, n = key.split(":")
    return banks[b][int(n)]


# ---------------------------------------------------------------- duplicates
def detect_duplicates(banks):
    """Heuristic: same scenario (question words) AND same correct answer (answer words)."""
    def corr(q):
        return " ".join(q["options"][x] for x in letters(q["answer"]) if x in q["options"])

    feats = {b: {n: (toks(q["question"]), toks(corr(q))) for n, q in qs.items()} for b, qs in banks.items()}
    pairs = []
    items = [(b, n) for b in feats for n in feats[b]]
    for i, (b1, n1) in enumerate(items):
        q1, c1 = feats[b1][n1]
        for b2, n2 in items[i + 1:]:
            q2, c2 = feats[b2][n2]
            qj = jac(q1, q2)
            if qj < 0.22:
                continue
            cj = jac(c1, c2)
            if (qj >= 0.22 and cj >= 0.45) or qj >= 0.45:
                pairs.append([f"{b1}:{n1}", f"{b2}:{n2}"])
    return pairs


# Hand-checked pairs the heuristic misses (reworded scenario, same tested point).
MANUAL_DUPLICATES = [["saa:308", "bonso:244"], ["saa:65", "bonso:378"], ["saa:95", "bonso:49"],
                     ["saa:322", "bonso:121"]]

# Pairs the heuristic links but whose correct answer differs (keep them separate — they are
# exactly the look-alike questions worth reviewing side by side).
MANUAL_NOT_DUPLICATES = [
    # FSx for Lustre (69, 243) vs FSx for Windows File Server (156, 328, 559)
    ["saa:69", "saa:156"], ["saa:69", "saa:328"], ["saa:69", "saa:559"],
    ["saa:156", "saa:243"], ["saa:243", "saa:328"], ["saa:243", "saa:559"],
    ["saa:106", "saa:225"],    # 2 AZs x 3 instances vs 3 AZs + DynamoDB
    ["bonso:74", "bonso:83"],  # Object Lock compliance vs versioning + lifecycle
    ["saa:52", "saa:397"],     # 2-tier vs 3-tier security groups
    ["saa:399", "saa:633"],    # contact form via SNS vs SES
]


def build_alias_map(data):
    """Union-find over duplicate pairs; canonical = bonso first, then lowest number."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    ignore = {tuple(sorted(p)) for p in data.get("not_duplicates", [])}
    for a, b in data["duplicates"]:
        if tuple(sorted((a, b))) in ignore:
            continue
        parent[find(a)] = find(b)
    groups = {}
    for x in list(parent):
        groups.setdefault(find(x), []).append(x)

    def rank(k):
        b, n = k.split(":")
        return (0 if b == "bonso" else 1, int(n))

    alias = {}
    for members in groups.values():
        keep = min(members, key=rank)
        for m in members:
            alias[m] = keep
    return alias


# ---------------------------------------------------------------- data file
def new_data(banks):
    return {
        "version": 1,
        "updated_at": None,
        "config": dict(DEFAULT_CONFIG),
        "ingested_attempt_ids": [],
        "duplicates": detect_duplicates(banks) + MANUAL_DUPLICATES,
        "not_duplicates": MANUAL_NOT_DUPLICATES,
        "questions": {},
    }


def load_data(banks):
    if DATA_FILE.exists():
        d = json.load(open(DATA_FILE))
        d["config"] = {**DEFAULT_CONFIG, **d.get("config", {})}
        return d
    return new_data(banks)


def save_data(d):
    d["updated_at"] = dt.datetime.now().isoformat(timespec="seconds")
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, indent=1, ensure_ascii=False))
    tmp.replace(DATA_FILE)


def entry(d, key):
    return d["questions"].setdefault(key, {"history": [], "manual": {"mastered": False, "note": ""}})


def add_result(d, banks, alias, src_key, date, result, picked, source):
    key = alias.get(src_key, src_key)
    e = entry(d, key)
    e["history"].append({"date": date, "result": result, "picked": picked,
                         "asked_as": src_key, "source": source})


# ---------------------------------------------------------------- ingest
def ingest(d, banks, history_path):
    alias = build_alias_map(d)
    hist = json.load(open(history_path))
    seen = set(d["ingested_attempt_ids"])
    added = 0
    for a in sorted(hist.get("attempts", []), key=lambda a: a["startedAt"]):
        if a["id"] in seen:
            continue
        bank = EXAM_CODE_TO_BANK.get(a["examCode"])
        if not bank:
            print(f"skip attempt {a['id']}: unknown examCode {a['examCode']!r}", file=sys.stderr)
            continue
        ts = a.get("finishedAt") or a["startedAt"]
        date = dt.datetime.fromtimestamp(ts / 1000).date().isoformat()
        flagged = set(map(str, (a.get("flagged") or {}).keys()))
        for n, picked in a["answers"].items():
            q = banks[bank].get(int(n))
            if not q or not picked:
                continue
            ok = letters(picked) == letters(q["answer"])
            add_result(d, banks, alias, f"{bank}:{n}", date, "right" if ok else "wrong",
                       letters(picked), f"app:{a['id']}")
            if n in flagged:
                entry(d, alias.get(f"{bank}:{n}", f"{bank}:{n}"))["manual"]["flagged"] = True
        d["ingested_attempt_ids"].append(a["id"])
        added += 1
    return added


def remap_aliases(d):
    """If duplicates were edited, move history from non-canonical keys onto the kept key."""
    alias = build_alias_map(d)
    for k in list(d["questions"]):
        tgt = alias.get(k, k)
        if tgt != k:
            src = d["questions"].pop(k)
            e = entry(d, tgt)
            e["history"].extend(src["history"])
            if src["manual"].get("note"):
                e["manual"]["note"] = (e["manual"].get("note", "") + " " + src["manual"]["note"]).strip()
    return alias


# ---------------------------------------------------------------- scoring
def confusion(q, wrong_picks):
    correct = [x for x in letters(q["answer"]) if x in q["options"]]
    wrong = [x for x in q["options"] if x not in correct]
    best, pair = 0.0, None
    for c in correct:
        tc = toks(q["options"][c])
        for w in wrong:
            s = jac(tc, toks(q["options"][w]))
            if s > best:
                best, pair = s, (c, w)
    # the option you actually confused it with counts double toward "confusing"
    picked_best = 0.0
    for picks in wrong_picks:
        for w in picks:
            if w in q["options"] and w not in correct:
                for c in correct:
                    picked_best = max(picked_best, jac(toks(q["options"][c]), toks(q["options"][w])))
    return max(best, picked_best), pair


def score_entry(key, e, banks, alias_groups, cfg, now):
    q = qget(banks, key)
    hist = sorted(e["history"], key=lambda h: h["date"])
    n = len(hist)
    wrongs = [h for h in hist if h["result"] == "wrong"]
    W = len(wrongs)
    parts = {}
    if W:
        parts["mistakes"] = cfg["w_first_wrong"] + cfg["w_extra_wrong"] * min(W - 1, 2)
        last_wrong = dt.date.fromisoformat(wrongs[-1]["date"])
        days = max(0, (now - last_wrong).days)
        parts["recency"] = cfg["w_recency"] * 0.5 ** (days / cfg["half_life_days"])
        streak = 0
        for h in reversed(hist):
            if h["result"] == "right":
                streak += 1
            else:
                break
        if streak == 0:
            parts["unresolved"] = cfg["w_unresolved"]
        else:
            parts["fixed_streak"] = cfg["w_streak_bonus"] * min(streak, 3)
    if len(letters(q["answer"])) > 1:
        parts["multi_answer"] = cfg["w_multi"]
    sim, pair = confusion(q, [h["picked"] for h in wrongs])
    lo, hi = cfg["confusion_floor"], cfg["confusion_ceil"]
    conf = min(1.0, max(0.0, (sim - lo) / (hi - lo)))
    if conf:
        parts["confusing"] = cfg["w_confusing"] * conf
    # community accuracy from any member of the duplicate group that has votes
    accs = [qget(banks, k)["accuracy_percent"] for k in alias_groups.get(key, [key])
            if qget(banks, k).get("votes", 0) >= 5]
    if accs:
        acc = min(accs)
        if acc < 100:
            parts["community_hard"] = cfg["w_community"] * (1 - acc / 100)
    score = 0.0 if e["manual"].get("mastered") else sum(parts.values())
    e["score"] = round(max(0.0, score), 1)
    e["parts"] = {k: round(v, 1) for k, v in parts.items()}
    e["stats"] = {
        "attempts": n, "wrong": W,
        "last_result": hist[-1]["result"] if hist else None,
        "last_date": hist[-1]["date"] if hist else None,
        "last_wrong_date": wrongs[-1]["date"] if W else None,
        "multi_answer": len(letters(q["answer"])) > 1,
        "option_similarity": round(sim, 2),
        "similar_pair": list(pair) if pair else None,
        "tags": q.get("tags", []),
    }


def rescore(d, banks):
    alias = remap_aliases(d)
    groups = {}
    for k, v in alias.items():
        groups.setdefault(v, []).append(k)
    now = today()
    for key, e in d["questions"].items():
        score_entry(key, e, banks, groups, d["config"], now)
    return groups


# ---------------------------------------------------------------- markdown
LABEL = {"saa": "saa-c03", "bonso": "bonso"}


def fmt_key(k):
    b, n = k.split(":")
    return f"{LABEL[b]} #{n}"


def fmt_expl(text):
    out = []
    for line in text.strip().splitlines():
        s = line.strip()
        if re.match(r"^[A-Z][A-Z /&'-]{3,}(:.*)?$", s):
            out.append("")
            out.append(f"**{s}**")
            out.append("")
        else:
            out.append(line)
    return "\n".join(out).strip()


def reasons(e):
    s, p = e["stats"], e["parts"]
    r = [f"wrong {s['wrong']}/{s['attempts']}"]
    if s["last_wrong_date"]:
        days = (today() - dt.date.fromisoformat(s["last_wrong_date"])).days
        r.append(f"last wrong {s['last_wrong_date']} ({days}d ago)")
    if "unresolved" in p:
        r.append("**still wrong on last try**")
    if "fixed_streak" in p:
        r.append("fixed since")
    if s["multi_answer"]:
        r.append("**multi-answer**")
    if p.get("confusing", 0) >= 7 and s["similar_pair"]:
        c, w = s["similar_pair"]
        r.append(f"look-alike options {c}~{w}")
    if p.get("community_hard", 0) >= 2:
        r.append("hard for others too")
    return " · ".join(r)


def render(d, banks, groups, top_n=None):
    top_n = top_n or d["config"]["top_n"]
    ranked = sorted(
        ((k, e) for k, e in d["questions"].items() if not e["manual"].get("mastered")),
        key=lambda kv: (-kv[1]["score"], kv[0]))
    wrong_ever = [(k, e) for k, e in ranked if e["stats"]["wrong"]]
    unresolved = [k for k, e in wrong_ever if "unresolved" in e["parts"]]
    L = []
    L.append("# SAA-C03 — Questions to Review")
    L.append("")
    L.append(f"Generated {today().isoformat()} from `review-data.json`. "
             f"{len(d['questions'])} unique questions practiced · {len(wrong_ever)} answered wrong at least once · "
             f"{len(unresolved)} still wrong on the last try · "
             f"{sum(1 for e in d['questions'].values() if e['manual'].get('mastered'))} marked mastered.")
    L.append("")
    L.append("**Score** = mistakes (30, +12 per extra wrong, max 2 extra) + recency (≤20, halves every "
             f"{d['config']['half_life_days']} days) + still wrong on last try (10) − correct streak since "
             "(10 each) + multi-answer (10) + look-alike options (≤15) + community accuracy (≤8, saa-c03 only). "
             "Duplicates across banks are merged into one question (bonso preferred), history combined.")
    L.append("")

    # weak topics
    topic = {}
    for k, e in wrong_ever:
        for t in e["stats"]["tags"] or ["untagged"]:
            tw = topic.setdefault(t, [0, 0, 0.0])
            tw[0] += 1
            tw[1] += 1 if "unresolved" in e["parts"] else 0
            tw[2] += e["score"]
    L.append("## Weak topics")
    L.append("")
    L.append("| Topic | Wrong questions | Still wrong | Total score |")
    L.append("|---|---:|---:|---:|")
    for t, (a, b, s) in sorted(topic.items(), key=lambda x: -x[1][2]):
        L.append(f"| {t} | {a} | {b} | {s:.0f} |")
    L.append("")

    # summary table
    top = ranked[:top_n]
    L.append(f"## Top {len(top)}")
    L.append("")
    L.append("| # | Score | Question | Wrong | Last wrong | Flags | Topic |")
    L.append("|---:|---:|---|---:|---|---|---|")
    for i, (k, e) in enumerate(top, 1):
        s = e["stats"]
        flags = []
        if "unresolved" in e["parts"]:
            flags.append("still-wrong")
        if s["multi_answer"]:
            flags.append("multi")
        if e["parts"].get("confusing", 0) >= 7:
            flags.append("look-alike")
        L.append(f"| {i} | {e['score']} | [{fmt_key(k)}](#{i}-{k.replace(':', '-')}) | "
                 f"{s['wrong']}/{s['attempts']} | {s['last_wrong_date'] or '—'} | {', '.join(flags)} | "
                 f"{', '.join(s['tags'][:2])} |")
    L.append("")

    # details
    L.append("## Details")
    L.append("")
    for i, (k, e) in enumerate(top, 1):
        q = qget(banks, k)
        s = e["stats"]
        L.append(f'<a id="{i}-{k.replace(":", "-")}"></a>')
        L.append(f"### {i}. {fmt_key(k)} — score {e['score']}")
        L.append("")
        L.append(reasons(e))
        dupes = [x for x in groups.get(k, []) if x != k]
        if dupes:
            L.append(f"  \nSame question also in: {', '.join(fmt_key(x) for x in dupes)}")
        if q.get("uncertain"):
            L.append("  \n> Answer key for this question is marked **uncertain** in the bank — double-check.")
        if e["manual"].get("note"):
            L.append(f"  \n> Note: {e['manual']['note']}")
        L.append("")
        L.append(q["question"].strip())
        L.append("")
        correct = set(letters(q["answer"]))
        picked_wrong = {}
        for h in e["history"]:
            if h["result"] == "wrong" and h["asked_as"] == k:
                for p in h["picked"]:
                    if p not in correct:
                        picked_wrong.setdefault(p, []).append(h["date"])
        for opt, text in q["options"].items():
            mark = ""
            if opt in correct:
                mark = " ✅"
            elif opt in picked_wrong:
                mark = f" ❌ *(you picked, {', '.join(sorted(set(picked_wrong[opt])))})*"
            L.append(f"- **{opt}.** {text.strip()}{mark}")
        other_picks = [h for h in e["history"] if h["result"] == "wrong" and h["asked_as"] != k]
        if other_picks:
            L.append("")
            L.append("Wrong as " + "; ".join(
                f"{fmt_key(h['asked_as'])} on {h['date']} (picked {','.join(h['picked'])}, "
                f"correct {','.join(letters(qget(banks, h['asked_as'])['answer']))})" for h in other_picks))
        expl = q.get("explanation") or next(
            (qget(banks, x).get("explanation") for x in dupes if qget(banks, x).get("explanation")), None)
        if expl:
            L.append("")
            L.append("<details><summary>Explanation</summary>")
            L.append("")
            L.append(fmt_expl(expl))
            L.append("")
            L.append("</details>")
        L.append("")
        L.append("---")
        L.append("")

    # the rest
    rest = [(k, e) for k, e in ranked[top_n:] if e["stats"]["wrong"]]
    if rest:
        L.append(f"## Other questions answered wrong ({len(rest)})")
        L.append("")
        L.append("| Rank | Score | Question | Wrong | Last wrong | Topic |")
        L.append("|---:|---:|---|---:|---|---|")
        for i, (k, e) in enumerate(rest, top_n + 1):
            s = e["stats"]
            L.append(f"| {i} | {e['score']} | {fmt_key(k)} | {s['wrong']}/{s['attempts']} | "
                     f"{s['last_wrong_date']} | {', '.join(s['tags'][:2])} |")
        L.append("")
    MD_FILE.write_text("\n".join(L))


# ---------------------------------------------------------------- CLI
def resolve(d, key):
    key = key.replace("saa-c03-bonso:", "bonso:").replace("saa-c03:", "saa:")
    if ":" not in key:
        key = f"bonso:{key}"
    return build_alias_map(d).get(key, key)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sync")
    s.add_argument("history", nargs="?", default=str(DEFAULT_HISTORY))
    s.add_argument("--top", type=int)
    lg = sub.add_parser("log")
    lg.add_argument("key")
    lg.add_argument("result", choices=["right", "wrong"])
    lg.add_argument("--picked", default="")
    lg.add_argument("--date", default=None)
    m = sub.add_parser("master")
    m.add_argument("key")
    m.add_argument("--undo", action="store_true")
    nt = sub.add_parser("note")
    nt.add_argument("key")
    nt.add_argument("text")
    r = sub.add_parser("render")
    r.add_argument("--top", type=int)
    a = ap.parse_args()

    banks = load_banks()
    d = load_data(banks)
    if a.cmd == "sync":
        added = ingest(d, banks, a.history)
        print(f"ingested {added} new attempt(s)")
    elif a.cmd == "log":
        key = resolve(d, a.key)
        qget(banks, key)  # validate
        add_result(d, banks, {}, key, a.date or today().isoformat(), a.result,
                   letters(a.picked.replace(",", "")), "manual")
        print(f"logged {a.result} for {key}")
    elif a.cmd == "master":
        key = resolve(d, a.key)
        entry(d, key)["manual"]["mastered"] = not a.undo
        print(f"{key} mastered={not a.undo}")
    elif a.cmd == "note":
        key = resolve(d, a.key)
        entry(d, key)["manual"]["note"] = a.text
    groups = rescore(d, banks)
    save_data(d)
    render(d, banks, groups, getattr(a, "top", None))
    print(f"wrote {DATA_FILE}\nwrote {MD_FILE}")


if __name__ == "__main__":
    main()
