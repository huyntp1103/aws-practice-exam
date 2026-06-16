import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ClipboardCopy, Flag, Sparkles } from "lucide-react";

import { loadExamBank, loadExplanationsSeed, loadUncertain } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { hasAnswerKey, isCorrect, normalizeAnswer } from "@/lib/session";
import { examByCode } from "@/lib/exams";
import { explainQuestion } from "@/lib/gemini";
import { toUncertainMap, type UncertainMap } from "@/lib/uncertain";
import { cn } from "@/lib/utils";
import type { Attempt, ExamBank, Explanation, RawQuestion } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type Filter = "all" | "incorrect" | "flagged" | "unanswered" | "uncertain";

export function Results() {
  const { examCode = "", attemptId = "" } = useParams();
  const nav = useNavigate();
  const meta = examByCode(examCode);
  const [bank, setBank] = useState<ExamBank | null>(null);
  const [uncertain, setUncertain] = useState<UncertainMap>(() => new Map());
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openQ, setOpenQ] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Explanation>>({});

  useEffect(() => {
    loadExamBank(examCode)
      .then(setBank)
      .catch((e) => setErr(String(e.message ?? e)));
    loadUncertain(examCode).then((u) => setUncertain(toUncertainMap(u)));
    // Merge committed seed (data/<exam>/explanations.json) under localStorage,
    // so the user's own newer ones win.
    const local = Storage.getExplanations(examCode);
    loadExplanationsSeed(examCode).then((seed) => {
      setExplanations({ ...(seed?.items ?? {}), ...local });
    });
    const a = Storage.getAttempt(examCode, attemptId);
    if (!a) setErr("Attempt not found.");
    else setAttempt(a);
  }, [examCode, attemptId]);

  function onExplained(qNum: number, exp: Explanation) {
    Storage.setExplanation(examCode, qNum, exp);
    setExplanations((prev) => ({ ...prev, [String(qNum)]: exp }));
  }

  const byNum = useMemo(() => {
    if (!bank) return new Map<number, RawQuestion>();
    return new Map(bank.questions.map((q) => [q.number, q]));
  }, [bank]);

  // Study export: pick questions to feed into a Claude Code command that
  // updates personal notes. Default-select every strictly-incorrect question
  // (wrong pick present); the user opts in correct/unanswered ones to review.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current || !bank || !attempt) return;
    const def = new Set<number>();
    for (const n of attempt.questionNumbers) {
      const q = byNum.get(n);
      const picked = attempt.answers[n] ?? [];
      if (q && picked.length > 0 && isCorrect(q, picked) === false) def.add(n);
    }
    setSelected(def);
    initedRef.current = true;
  }, [bank, attempt, byNum]);

  function toggleSelected(n: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const command = useMemo(() => {
    if (!bank || !attempt || selected.size === 0) return "";
    const groupA: string[] = []; // got wrong / unanswered
    const groupB: string[] = []; // got right, review
    for (const n of attempt.questionNumbers) {
      if (!selected.has(n)) continue;
      const q = byNum.get(n);
      if (!q) continue;
      const picked = attempt.answers[n] ?? [];
      if (isCorrect(q, picked) === true) groupB.push(`- #${n}`);
      else groupA.push(picked.length ? `- #${n} pick=${picked.join(",")}` : `- #${n}`);
    }
    return buildCommand(examCode, groupA, groupB);
  }, [bank, attempt, byNum, selected, examCode]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Couldn't copy to clipboard.");
    }
  }

  if (err) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="text-destructive">{err}</div>
            <Button onClick={() => nav("/")}>
              <ArrowLeft /> Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!bank || !attempt) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const scoreable = hasAnswerKey(bank);
  const total = attempt.questionNumbers.length;
  const answeredCount = attempt.questionNumbers.filter(
    (n) => (attempt.answers[n]?.length ?? 0) > 0
  ).length;
  const flaggedCount = Object.keys(attempt.flagged).length;
  const pct =
    attempt.score && attempt.score.scoreable > 0
      ? Math.round((attempt.score.correct / attempt.score.scoreable) * 100)
      : null;

  const visible = attempt.questionNumbers.filter((n) => {
    const q = byNum.get(n);
    if (!q) return false;
    if (filter === "all") return true;
    if (filter === "flagged") return !!attempt.flagged[n];
    if (filter === "unanswered") return !(attempt.answers[n]?.length);
    if (filter === "uncertain") return uncertain.has(n);
    if (filter === "incorrect") {
      const ok = isCorrect(q, attempt.answers[n]);
      return ok === false;
    }
    return true;
  });

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => nav("/")}>
          <ArrowLeft /> Home
        </Button>
        <div className="text-sm font-medium truncate">{meta?.name ?? examCode}</div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Session results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scoreable && pct !== null ? (
            <>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-bold tabular-nums">{pct}%</div>
                <div className="text-sm text-muted-foreground pb-1">
                  {attempt.score!.correct} of {attempt.score!.scoreable} scoreable
                </div>
              </div>
              <Progress value={pct} />
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              No answer key for this exam — self-review only.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
            <Stat label="Questions" value={total} />
            <Stat label="Answered" value={answeredCount} />
            <Stat label="Unanswered" value={total - answeredCount} />
            <Stat label="Flagged" value={flaggedCount} />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Filter id="all" current={filter} setFilter={setFilter} label="All" />
            {scoreable && (
              <Filter id="incorrect" current={filter} setFilter={setFilter} label="Incorrect" />
            )}
            <Filter id="flagged" current={filter} setFilter={setFilter} label="Flagged" />
            <Filter id="unanswered" current={filter} setFilter={setFilter} label="Unanswered" />
            {uncertain.size > 0 && (
              <Filter
                id="uncertain"
                current={filter}
                setFilter={setFilter}
                label={`Double-check (${uncertain.size})`}
              />
            )}
          </div>

          {scoreable && (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">
                    {selected.size}
                  </span>{" "}
                  selected for study export
                  <span className="block text-xs">
                    All incorrect are pre-selected — tick any correct ones you want to
                    review.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selected.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </Button>
                  )}
                  <Button size="sm" onClick={copyCommand} disabled={selected.size === 0}>
                    <ClipboardCopy /> {copied ? "Copied!" : "Copy Claude Code command"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Question list */}
      <div className="space-y-2">
        {visible.map((qNum) => {
          const q = byNum.get(qNum)!;
          const picked = attempt.answers[qNum] ?? [];
          const key = normalizeAnswer(q.answer);
          const ok = isCorrect(q, picked);
          const open = openQ === qNum;
          return (
            <Card key={qNum}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start gap-2">
                {scoreable && (
                  <Checkbox
                    className="mt-1.5"
                    checked={selected.has(qNum)}
                    onCheckedChange={() => toggleSelected(qNum)}
                    aria-label={`Select question ${qNum} for study export`}
                  />
                )}
                <button
                  className="flex-1 text-left"
                  onClick={() => setOpenQ(open ? null : qNum)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">#{q.number}</Badge>
                    {attempt.flagged[qNum] && (
                      <Badge variant="warning" className="gap-1">
                        <Flag className="h-3 w-3" /> Flagged
                      </Badge>
                    )}
                    {uncertain.has(qNum) && (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Double-check
                      </Badge>
                    )}
                    {ok === true && <Badge variant="success">Correct</Badge>}
                    {ok === false && picked.length > 0 && (
                      <Badge variant="destructive">Incorrect</Badge>
                    )}
                    {picked.length === 0 && <Badge variant="outline">Unanswered</Badge>}
                    {key && (
                      <span className="text-xs text-muted-foreground">
                        answer: <span className="font-mono">{key.join(", ")}</span>
                        {picked.length > 0 && (
                          <>
                            {" · your pick: "}
                            <span className="font-mono">{picked.join(", ")}</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm">{q.question}</div>
                </button>
                </div>

                {open && (
                  <div className="space-y-2 pt-2">
                    <div className="whitespace-pre-wrap text-sm">{q.question}</div>
                    {uncertain.get(qNum) && (
                      <div className="rounded-md border border-warning/60 bg-warning/10 p-3 text-xs leading-relaxed">
                        <div className="mb-1 flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" /> Uncertain answer — double-check
                        </div>
                        {uncertain.get(qNum)!.note}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {Object.keys(q.options).sort().map((L) => {
                        const isAns = key?.includes(L);
                        const isPicked = picked.includes(L);
                        return (
                          <div
                            key={L}
                            className={cn(
                              "rounded-md border p-2 text-sm",
                              isAns && "border-success bg-success/10",
                              isPicked && !isAns && "border-destructive bg-destructive/10"
                            )}
                          >
                            <span className="font-mono font-medium">{L}.</span> {q.options[L]}
                            {isPicked && (
                              <Badge variant="outline" className="ml-2">your pick</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {key && (
                      <ExplainBlock
                        q={q}
                        explanation={explanations[String(qNum)]}
                        onSaved={(exp) => onExplained(qNum, exp)}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No questions match this filter.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="pt-2">
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft /> Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}

function buildCommand(examCode: string, groupA: string[], groupB: string[]): string {
  const lines: string[] = [
    "Update my personal AWS study notes at `Technical/AWS.md`.",
    `I'm studying for the ${examCode} exam.`,
    "",
    "Questions from a practice session. Look each up in this repo's bank at",
    `\`/Users/huynguyen-mac-be/personal-project/aws-study/data/${examCode}/questions.json\` (match the \`number\` field) for the full`,
    "question, options, and correct `answer`.",
    "",
  ];
  if (groupA.length) {
    lines.push("GROUP A — got WRONG (my pick shown):", ...groupA, "");
  }
  if (groupB.length) {
    lines.push("GROUP B — got RIGHT but want to review:", ...groupB, "");
  }
  const what =
    groupA.length && groupB.length
      ? "the correct answer + why, and for Group A why my pick was wrong"
      : groupA.length
        ? "the correct answer + why my pick was wrong"
        : "the correct answer + why it's right";
  lines.push(
    "For each, consider to add new content or update my study note, follow current rule, focus on exam. Finally please shortly response to summary of what changed.",
  );
  return lines.join("\n");
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Filter({
  id,
  current,
  setFilter,
  label,
}: {
  id: Filter;
  current: Filter;
  setFilter: (f: Filter) => void;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={current === id ? "default" : "outline"}
      onClick={() => setFilter(id)}
    >
      {label}
    </Button>
  );
}

function ExplainBlock({
  q,
  explanation,
  onSaved,
}: {
  q: RawQuestion;
  explanation: Explanation | undefined;
  onSaved: (exp: Explanation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasKey = !!Storage.getGeminiKey();

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const apiKey = Storage.getGeminiKey();
      const text = await explainQuestion(apiKey, q);
      const exp: Explanation = { text, createdAt: Date.now() };
      onSaved(exp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (explanation) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI explanation
          </span>
          {explanation.createdAt > 0 && (
            <span className="text-muted-foreground">
              {new Date(explanation.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="whitespace-pre-wrap">{explanation.text}</div>
        <div className="pt-2">
          <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
            <Sparkles /> {busy ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
        {err && <div className="mt-1 text-xs text-destructive">{err}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={run} disabled={busy || !hasKey}>
        <Sparkles /> {busy ? "Asking Gemini…" : "Explain"}
      </Button>
      {!hasKey && (
        <div className="text-xs text-muted-foreground">
          Add a Gemini API key in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>{" "}
          to enable explanations.
        </div>
      )}
      {err && <div className="text-xs text-destructive">{err}</div>}
    </div>
  );
}
