import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flag,
  Highlighter,
  Home as HomeIcon,
  Pause,
  Play,
  Strikethrough,
} from "lucide-react";

import { loadExamBank, loadUncertain } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { hasAnswerKey, isMulti, makeAttempt } from "@/lib/session";
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
  const [highlightMode, setHighlightMode] = useState(false);

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
      } else if (e.key === "m" || e.key === "M") {
        setHighlightMode((v) => !v);
      } else if ((e.key === "p" || e.key === "P") && state.endsAt != null) {
        togglePause();
      } else if (/^[a-hA-H]$/.test(e.key)) {
        const letter = e.key.toUpperCase();
        if (!q.options[letter]) return;
        if (e.shiftKey) toggleStrike(letter);
        else togglePick(letter);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bank]);

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

  function togglePause() {
    setState((prev) => {
      if (!prev || prev.endsAt == null) return prev;
      if (prev.paused) {
        const elapsed = Date.now() - (prev.pausedAt ?? Date.now());
        return { ...prev, paused: false, pausedAt: undefined, endsAt: prev.endsAt + elapsed };
      }
      return { ...prev, paused: true, pausedAt: Date.now() };
    });
  }

  function toggleStrike(letter: string) {
    setState((prev) => {
      if (!prev) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const current = prev.struck[qNum] ?? [];
      const next = current.includes(letter)
        ? current.filter((l) => l !== letter)
        : [...current, letter];
      return { ...prev, struck: { ...prev.struck, [qNum]: next } };
    });
  }

  function addHighlight(start: number, end: number) {
    setState((prev) => {
      if (!prev) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const current = prev.highlights[qNum] ?? [];
      return { ...prev, highlights: { ...prev.highlights, [qNum]: mergeRanges(current, start, end) } };
    });
  }

  function removeHighlight(index: number) {
    setState((prev) => {
      if (!prev) return prev;
      const qNum = prev.config.questionNumbers[prev.currentIndex];
      const current = prev.highlights[qNum] ?? [];
      return {
        ...prev,
        highlights: { ...prev.highlights, [qNum]: current.filter((_, i) => i !== index) },
      };
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
  const struck = state.struck[qNum] ?? [];
  const highlights = state.highlights[qNum] ?? [];
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
          {state.endsAt != null && (
            <>
              <Timer endsAt={state.endsAt} paused={!!state.paused} onExpire={() => finish(true)} />
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePause}
                aria-label={state.paused ? "Resume timer" : "Pause timer"}
              >
                {state.paused ? <Play /> : <Pause />}
              </Button>
            </>
          )}
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
              {q.votes > 0 && (
                <>
                  <span>Accuracy {q.accuracy_percent}%</span>
                  <span>·</span>
                  <span>{q.votes} votes</span>
                </>
              )}
              {multi && <Badge variant="warning">Multi-select</Badge>}
              {!scoreable && <Badge variant="outline">Self-review</Badge>}
              {uncertainNote && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Double-check
                </Badge>
              )}
            </div>

            <HighlightableText
              text={q.question}
              ranges={highlights}
              highlightMode={highlightMode}
              onAddHighlight={addHighlight}
              onRemoveHighlight={removeHighlight}
            />

            <OptionsList
              q={q}
              picked={picked}
              multi={multi}
              struck={struck}
              onToggle={togglePick}
              onToggleStrike={toggleStrike}
            />

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
                  onClick={() => setHighlightMode((v) => !v)}
                  className={cn(
                    highlightMode &&
                      "bg-yellow-200/70 text-yellow-950 hover:bg-yellow-200 dark:bg-yellow-400/20 dark:text-yellow-200"
                  )}
                >
                  <Highlighter /> {highlightMode ? "Highlighting" : "Highlight"}
                </Button>
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
              <div>• A–H keys to pick · ←/→ navigate · F flag · M highlight · Shift+letter strike</div>
              {state.endsAt != null && <div>• P pause/resume timer</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- Highlighter (question text) ---------------------------------------

interface HighlightableTextProps {
  text: string;
  ranges: [number, number][];
  highlightMode: boolean;
  onAddHighlight: (start: number, end: number) => void;
  onRemoveHighlight: (index: number) => void;
}

function HighlightableText({
  text,
  ranges,
  highlightMode,
  onAddHighlight,
  onRemoveHighlight,
}: HighlightableTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseUp() {
    if (!highlightMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !ref.current) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;
    const start = textOffset(ref.current, range.startContainer, range.startOffset);
    const end = textOffset(ref.current, range.endContainer, range.endOffset);
    sel.removeAllRanges();
    if (end > start) onAddHighlight(start, end);
  }

  const segments = splitByRanges(text, ranges);

  return (
    <div
      ref={ref}
      onMouseUp={handleMouseUp}
      className={cn(
        "whitespace-pre-wrap text-sm leading-relaxed",
        highlightMode && "cursor-text"
      )}
    >
      {segments.map((seg, i) =>
        seg.rangeIndex === null ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <mark
            key={i}
            onClick={() => onRemoveHighlight(seg.rangeIndex!)}
            title="Click to remove highlight"
            className="cursor-pointer rounded-sm bg-yellow-200/70 dark:bg-yellow-400/30"
          >
            {seg.text}
          </mark>
        )
      )}
    </div>
  );
}

function textOffset(root: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return total;
}

function mergeRanges(ranges: [number, number][], start: number, end: number): [number, number][] {
  const sorted = [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

function splitByRanges(
  text: string,
  ranges: [number, number][]
): Array<{ text: string; rangeIndex: number | null }> {
  const segments: Array<{ text: string; rangeIndex: number | null }> = [];
  let pos = 0;
  ranges.forEach(([start, end], idx) => {
    if (start > pos) segments.push({ text: text.slice(pos, start), rangeIndex: null });
    segments.push({ text: text.slice(start, end), rangeIndex: idx });
    pos = end;
  });
  if (pos < text.length) segments.push({ text: text.slice(pos), rangeIndex: null });
  return segments;
}

// --- Options (with elimination strikethrough) ---------------------------

interface OptsProps {
  q: RawQuestion;
  picked: string[];
  multi: boolean;
  struck: string[];
  onToggle: (letter: string) => void;
  onToggleStrike: (letter: string) => void;
}

function OptionsList({ q, picked, multi, struck, onToggle, onToggleStrike }: OptsProps) {
  const letters = Object.keys(q.options).sort();

  function strikeButton(L: string, isStruck: boolean) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleStrike(L);
        }}
        title={isStruck ? "Unstrike option" : "Strike out option"}
        aria-label={isStruck ? `Unstrike option ${L}` : `Strike out option ${L}`}
        className={cn(
          "shrink-0 self-start rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
          isStruck && "bg-muted text-foreground"
        )}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>
    );
  }

  if (multi) {
    return (
      <div className="space-y-2">
        {letters.map((L) => {
          const checked = picked.includes(L);
          const isStruck = struck.includes(L);
          return (
            <label
              key={L}
              className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(L)}
                className="mt-0.5"
              />
              <div
                className={cn(
                  "text-sm flex-1",
                  isStruck && "text-muted-foreground line-through opacity-60"
                )}
              >
                <span className="font-mono font-medium">{L}.</span> {q.options[L]}
              </div>
              {strikeButton(L, isStruck)}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <RadioGroup value={picked[0] ?? ""} onValueChange={onToggle}>
      {letters.map((L) => {
        const isStruck = struck.includes(L);
        return (
          <Label
            key={L}
            htmlFor={`opt-${L}`}
            className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
          >
            <RadioGroupItem value={L} id={`opt-${L}`} className="mt-0.5" />
            <div
              className={cn(
                "text-sm font-normal flex-1",
                isStruck && "text-muted-foreground line-through opacity-60"
              )}
            >
              <span className="font-mono font-medium">{L}.</span> {q.options[L]}
            </div>
            {strikeButton(L, isStruck)}
          </Label>
        );
      })}
    </RadioGroup>
  );
}
