import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Flag } from "lucide-react";

import { loadExamBank, loadUncertain } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { hasAnswerKey, isCorrect, normalizeAnswer } from "@/lib/session";
import { examByCode } from "@/lib/exams";
import { toUncertainMap, type UncertainMap } from "@/lib/uncertain";
import { cn } from "@/lib/utils";
import type { Attempt, ExamBank, RawQuestion } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    loadExamBank(examCode)
      .then(setBank)
      .catch((e) => setErr(String(e.message ?? e)));
    loadUncertain(examCode).then((u) => setUncertain(toUncertainMap(u)));
    const a = Storage.getAttempt(examCode, attemptId);
    if (!a) setErr("Attempt not found.");
    else setAttempt(a);
  }, [examCode, attemptId]);

  const byNum = useMemo(() => {
    if (!bank) return new Map<number, RawQuestion>();
    return new Map(bank.questions.map((q) => [q.number, q]));
  }, [bank]);

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
                <button
                  className="w-full text-left"
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
