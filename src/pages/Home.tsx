import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, RotateCw, Trash2 } from "lucide-react";

import { EXAMS } from "@/lib/exams";
import { loadExamBank } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { buildSession, hasAnswerKey } from "@/lib/session";
import type { ExamBank, Mode, UserPrefs } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const COUNT_PRESETS = [10, 25, 50, 65];

export function Home() {
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<UserPrefs>(() => Storage.getPrefs());
  const [examCode, setExamCode] = useState<string>(
    EXAMS.find((e) => e.code === "saa-c03")?.code ?? EXAMS[0].code
  );
  const [mode, setMode] = useState<Mode>(prefs.defaultMode);
  const [count, setCount] = useState<number>(prefs.defaultCount);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(prefs.defaultTimerEnabled);
  const [timerMinutes, setTimerMinutes] = useState<number>(prefs.defaultTimerMinutes);

  const [bank, setBank] = useState<ExamBank | null>(null);
  const [bankErr, setBankErr] = useState<string | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  useEffect(() => {
    setBank(null);
    setBankErr(null);
    loadExamBank(examCode)
      .then((b) => setBank(b))
      .catch((e) => setBankErr(String(e.message ?? e)));
    const sess = Storage.getSession(examCode);
    setResumeAvailable(!!sess && !sess.finished);
    setAttemptCount(Storage.getAttempts(examCode).length);
  }, [examCode]);

  const scoreable = useMemo(() => (bank ? hasAnswerKey(bank) : false), [bank]);

  function savePrefsPartial(p: Partial<UserPrefs>) {
    const next = { ...prefs, ...p };
    setPrefs(next);
    Storage.setPrefs(next);
  }

  function start() {
    if (!bank) return;
    const effectiveCount = mode === "sequential" ? bank.questions.length : count;
    const session = buildSession(bank, {
      mode,
      count: effectiveCount,
      timerEnabled,
      timerMinutes,
    });
    Storage.setSession(examCode, session);
    savePrefsPartial({
      defaultMode: mode,
      defaultCount: count,
      defaultTimerEnabled: timerEnabled,
      defaultTimerMinutes: timerMinutes,
    });
    nav(`/session/${examCode}`);
  }

  function resume() {
    nav(`/session/${examCode}`);
  }

  function clearSession() {
    if (!confirm("Discard the in-progress session for this exam?")) return;
    Storage.clearSession(examCode);
    setResumeAvailable(false);
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start a practice session</CardTitle>
          <CardDescription>Pick an exam and how you want to practice. No timer by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Exam picker */}
          <section className="space-y-2">
            <Label>Exam</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={examCode}
              onChange={(e) => setExamCode(e.target.value)}
            >
              {EXAMS.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {bankErr && <span className="text-destructive">⚠ {bankErr}</span>}
              {bank && (
                <>
                  <span>{bank.questions.length} questions in bank</span>
                  <span>•</span>
                  <span>{scoreable ? "Answer key available" : "Self-review mode"}</span>
                  {attemptCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{attemptCount} past attempt{attemptCount === 1 ? "" : "s"}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </section>

          <Separator />

          {/* Mode */}
          <section className="space-y-3">
            <Label>Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="random" id="m-random" />
                <div>
                  <div className="text-sm font-medium">Random</div>
                  <div className="text-xs text-muted-foreground">Pick N questions at random</div>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="sequential" id="m-seq" />
                <div>
                  <div className="text-sm font-medium">Sequential</div>
                  <div className="text-xs text-muted-foreground">Walk through the whole bank</div>
                </div>
              </label>
            </RadioGroup>
          </section>

          {/* Count (random only) */}
          {mode === "random" && (
            <section className="space-y-2">
              <Label>Question count</Label>
              <div className="flex flex-wrap items-center gap-2">
                {COUNT_PRESETS.map((n) => (
                  <Button
                    key={n}
                    variant={count === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Input
                  type="number"
                  min={1}
                  max={bank?.questions.length ?? 999}
                  className="w-24"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, parseInt(e.target.value || "1", 10)))}
                />
                <span className="text-xs text-muted-foreground">
                  (max {bank?.questions.length ?? "?"})
                </span>
              </div>
            </section>
          )}

          <Separator />

          {/* Timer */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="timer-toggle">Timer</Label>
                <div className="text-xs text-muted-foreground">
                  Off by default. Enable to add a countdown for exam-like pacing.
                </div>
              </div>
              <Switch
                id="timer-toggle"
                checked={timerEnabled}
                onCheckedChange={setTimerEnabled}
              />
            </div>
            {timerEnabled && (
              <div className="flex items-center gap-2">
                <Label htmlFor="timer-min" className="text-sm">Minutes</Label>
                <Input
                  id="timer-min"
                  type="number"
                  min={1}
                  max={600}
                  className="w-24"
                  value={timerMinutes}
                  onChange={(e) =>
                    setTimerMinutes(Math.max(1, parseInt(e.target.value || "1", 10)))
                  }
                />
                <Badge variant="secondary">{Math.round(timerMinutes / 60 * 10) / 10} h</Badge>
              </div>
            )}
          </section>

          <Separator />

          {/* Actions */}
          <section className="flex flex-wrap items-center gap-2">
            <Button onClick={start} disabled={!bank} size="lg">
              <Play /> Start session
            </Button>
            {resumeAvailable && (
              <Button onClick={resume} variant="outline" size="lg">
                <RotateCw /> Resume in progress
              </Button>
            )}
            {resumeAvailable && (
              <Button onClick={clearSession} variant="ghost" size="sm">
                <Trash2 /> Discard
              </Button>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Past attempts */}
      {attemptCount > 0 && bank && <PastAttempts examCode={examCode} />}
    </div>
  );
}

function PastAttempts({ examCode }: { examCode: string }) {
  const nav = useNavigate();
  const [attempts, setAttempts] = useState(() => Storage.getAttempts(examCode));

  useEffect(() => {
    setAttempts(Storage.getAttempts(examCode));
  }, [examCode]);

  if (attempts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Past attempts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {attempts.slice(0, 10).map((a) => {
          const dt = new Date(a.finishedAt);
          const pct =
            a.score && a.score.scoreable > 0
              ? Math.round((a.score.correct / a.score.scoreable) * 100)
              : null;
          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="space-y-0.5">
                <div className="font-medium">
                  {dt.toLocaleString()} · {a.mode} · {a.count} Q
                </div>
                <div className="text-xs text-muted-foreground">
                  {pct !== null
                    ? `${a.score!.correct}/${a.score!.scoreable} correct (${pct}%)`
                    : "self-review"}
                  {a.timerEnabled && ` · timed ${a.timerMinutes}m`}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => nav(`/results/${examCode}/${a.id}`)}
                >
                  Review
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!confirm("Delete this attempt?")) return;
                    Storage.deleteAttempt(examCode, a.id);
                    setAttempts(Storage.getAttempts(examCode));
                  }}
                  aria-label="Delete attempt"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
