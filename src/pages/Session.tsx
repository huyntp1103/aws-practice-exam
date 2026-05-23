import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Flag, Home as HomeIcon } from "lucide-react";

import { loadExamBank, loadUncertain } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { hasAnswerKey, isCorrect, isMulti, makeAttempt, normalizeAnswer } from "@/lib/session";
import { examByCode } from "@/lib/exams";
import { toUncertainMap, type UncertainMap } from "@/lib/uncertain";
import { cn } from "@/lib/utils";
import type { ExamBank, RawQuestion, SessionState } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Timer } from "@/components/Timer";
import { JumperGrid } from "@/components/JumperGrid";

export function Session() {
  const { examCode = "" } = useParams();
  const nav = useNavigate();
  const meta = examByCode(examCode);

  const [bank, setBank] = useState<ExamBank | null>(null);
  const [uncertain, setUncertain] = useState<UncertainMap>(() => new Map());
  const [state, setState] = useState<SessionState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadExamBank(examCode)
      .then(setBank)
      .catch((e) => setErr(String(e.message ?? e)));
    loadUncertain(examCode).then((u) => setUncertain(toUncertainMap(u)));
    const s = Storage.getSession(examCode);
    if (!s) {
      setErr("No active session for this exam. Start one from Home.");
    } else {
      setState(s);
    }
  }, [examCode]);

  // Persist on every state change.
  useEffect(() => {
    if (state) Storage.setSession(examCode, state);
  }, [examCode, state]);

  const byNum = useMemo(() => {
    if (!bank) return new Map<number, RawQuestion>();
    return new Map(bank.questions.map((q) => [q.number, q]));
  }, [bank]);

  const scoreable = bank ? hasAnswerKey(bank) : false;

  const finish = useCallback(
    (auto = false) => {
      setState((prev) => {
        if (!prev || !bank) return prev;
        if (prev.finished) return prev;
        const finished: SessionState = { ...prev, finished: true, finishedAt: Date.now() };
        const attempt = makeAttempt(finished, bank);
        Storage.addAttempt(examCode, attempt);
        Storage.clearSession(examCode);
        // Defer nav so state persists before unmount
        setTimeout(() => nav(`/results/${examCode}/${attempt.id}`, { replace: true }), 0);
        if (auto) {
          // no-op; navigation handles UI
        }
        return finished;
      });
    },
    [bank, examCode, nav]
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!state || !bank) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const qNum = state.config.questionNumbers[state.currentIndex];
      const q = byNum.get(qNum);
      if (!q) return;
      if (e.key === "ArrowLeft") {
        setState((s) =>
          s && s.currentIndex > 0 ? { ...s, currentIndex: s.currentIndex - 1 } : s
        );
      } else if (e.key === "ArrowRight") {
        setState((s) =>
          s && s.currentIndex < s.config.questionNumbers.length - 1
            ? { ...s, currentIndex: s.currentIndex + 1 }
            : s
        );
      } else if (e.key === "f" || e.key === "F") {
        toggleFlag();
      } else if (e.key === "r" || e.key === "R") {
        if (scoreable && q.answer !== undefined) toggleReveal();
      } else if (/^[a-hA-H]$/.test(e.key)) {
        const letter = e.key.toUpperCase();
        if (q.options[letter]) togglePick(letter);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bank, scoreable]);

  function togglePick(letter: string) {
    setState((prev) => {
      if (!prev || !bank) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const q = byNum.get(qNum);
      if (!q) return prev;
      const multi = isMulti(q);
      const current = prev.answers[qNum] ?? [];
      let next: string[];
      if (multi) {
        next = current.includes(letter)
          ? current.filter((l) => l !== letter)
          : [...current, letter].sort();
      } else {
        next = current[0] === letter ? [] : [letter];
      }
      return { ...prev, answers: { ...prev.answers, [qNum]: next } };
    });
  }

  function toggleFlag() {
    setState((prev) => {
      if (!prev) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const flagged = { ...prev.flagged };
      if (flagged[qNum]) delete flagged[qNum];
      else flagged[qNum] = true;
      Storage.setFlag(examCode, qNum, !!flagged[qNum]);
      return { ...prev, flagged };
    });
  }

  function toggleReveal() {
    setState((prev) => {
      if (!prev) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const revealed = { ...prev.revealed };
      if (revealed[qNum]) delete revealed[qNum];
      else revealed[qNum] = true;
      return { ...prev, revealed };
    });
  }

  if (err) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="text-destructive">{err}</div>
            <Button onClick={() => nav("/")}>
              <HomeIcon /> Back home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!bank || !state) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const qNum = state.config.questionNumbers[state.currentIndex];
  const q = byNum.get(qNum);
  if (!q) {
    return <div className="container py-8">Question #{qNum} not found in bank.</div>;
  }

  const picked = state.answers[qNum] ?? [];
  const multi = isMulti(q);
  const answerKey = normalizeAnswer(q.answer);
  const revealed = !!state.revealed[qNum];
  const flagged = !!state.flagged[qNum];
  const uncertainNote = uncertain.get(qNum);
  const progress = ((state.currentIndex + 1) / state.config.questionNumbers.length) * 100;

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav("/")}>
            <HomeIcon /> Home
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="truncate text-sm font-medium" title={meta?.name}>
            {meta?.name ?? examCode}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.endsAt && <Timer endsAt={state.endsAt} onExpire={() => finish(true)} />}
          <Badge variant="outline">
            {state.currentIndex + 1} / {state.config.questionNumbers.length}
          </Badge>
        </div>
      </div>
      <Progress value={progress} />

      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        {/* Question */}
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">#{q.number}</Badge>
              <span>Accuracy {q.accuracy_percent}%</span>
              <span>·</span>
              <span>{q.votes} votes</span>
              {multi && <Badge variant="warning">Multi-select</Badge>}
              {!scoreable && <Badge variant="outline">Self-review</Badge>}
              {uncertainNote && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Double-check
                </Badge>
              )}
            </div>

            <div className="whitespace-pre-wrap text-sm leading-relaxed">{q.question}</div>

            {uncertainNote && revealed && (
              <div className="rounded-md border border-warning/60 bg-warning/10 p-3 text-sm">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" /> Uncertain answer
                </div>
                <div className="text-xs leading-relaxed">{uncertainNote.note}</div>
              </div>
            )}

            <OptionsList
              q={q}
              picked={picked}
              multi={multi}
              answerKey={answerKey}
              revealed={revealed}
              onToggle={togglePick}
            />

            {revealed && answerKey && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <span className="font-medium">Answer: </span>
                <span className="font-mono">{answerKey.join(", ")}</span>
                {(() => {
                  const ok = isCorrect(q, picked);
                  if (picked.length === 0) return null;
                  return ok ? (
                    <Badge variant="success" className="ml-2">Correct</Badge>
                  ) : (
                    <Badge variant="destructive" className="ml-2">Incorrect</Badge>
                  );
                })()}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setState((s) => (s ? { ...s, currentIndex: Math.max(0, s.currentIndex - 1) } : s))
                  }
                  disabled={state.currentIndex === 0}
                >
                  <ChevronLeft /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setState((s) =>
                      s
                        ? {
                            ...s,
                            currentIndex: Math.min(
                              s.config.questionNumbers.length - 1,
                              s.currentIndex + 1
                            ),
                          }
                        : s
                    )
                  }
                  disabled={state.currentIndex === state.config.questionNumbers.length - 1}
                >
                  Next <ChevronRight />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFlag}
                  className={cn(
                    flagged && "bg-warning text-warning-foreground hover:bg-warning/90"
                  )}
                >
                  <Flag /> {flagged ? "Flagged" : "Flag"}
                </Button>
                {scoreable && q.answer !== undefined && (
                  <Button variant="ghost" size="sm" onClick={toggleReveal}>
                    <Eye /> {revealed ? "Hide" : "Reveal"}
                  </Button>
                )}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (confirm("Finish this session and view results?")) finish();
                  }}
                >
                  Finish
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jumper */}
        <Card className="md:sticky md:top-4 h-fit">
          <CardContent className="py-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Questions</div>
            <JumperGrid
              state={state}
              onJump={(idx) => setState((s) => (s ? { ...s, currentIndex: idx } : s))}
            />
            <div className="pt-2 text-[10px] text-muted-foreground space-y-0.5">
              <div>• Filled = answered</div>
              <div>• Yellow dot = flagged</div>
              <div>• A–H keys to pick · ←/→ navigate · F flag · R reveal</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface OptsProps {
  q: RawQuestion;
  picked: string[];
  multi: boolean;
  answerKey: string[] | null;
  revealed: boolean;
  onToggle: (letter: string) => void;
}

function OptionsList({ q, picked, multi, answerKey, revealed, onToggle }: OptsProps) {
  const letters = Object.keys(q.options).sort();

  if (multi) {
    return (
      <div className="space-y-2">
        {letters.map((L) => {
          const checked = picked.includes(L);
          const isAns = revealed && answerKey?.includes(L);
          const isWrong = revealed && checked && !answerKey?.includes(L);
          return (
            <label
              key={L}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent",
                isAns && "border-success bg-success/10",
                isWrong && "border-destructive bg-destructive/10"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(L)}
                className="mt-0.5"
              />
              <div className="text-sm">
                <span className="font-mono font-medium">{L}.</span> {q.options[L]}
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <RadioGroup value={picked[0] ?? ""} onValueChange={onToggle}>
      {letters.map((L) => {
        const isPicked = picked[0] === L;
        const isAns = revealed && answerKey?.includes(L);
        const isWrong = revealed && isPicked && !answerKey?.includes(L);
        return (
          <Label
            key={L}
            htmlFor={`opt-${L}`}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent",
              isAns && "border-success bg-success/10",
              isWrong && "border-destructive bg-destructive/10"
            )}
          >
            <RadioGroupItem value={L} id={`opt-${L}`} className="mt-0.5" />
            <div className="text-sm font-normal">
              <span className="font-mono font-medium">{L}.</span> {q.options[L]}
            </div>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
