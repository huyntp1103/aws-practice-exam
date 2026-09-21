import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Trash2, Upload } from "lucide-react";

import { EXAMS, examByCode } from "@/lib/exams";
import { Storage } from "@/lib/storage";
import type { Attempt, HistoryExportFile } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = Attempt & { exam: string };

function loadAll(): Row[] {
  const rows: Row[] = [];
  for (const e of EXAMS) {
    for (const a of Storage.getAttempts(e.code)) {
      rows.push({ ...a, exam: e.code });
    }
  }
  rows.sort((a, b) => b.finishedAt - a.finishedAt);
  return rows;
}

function isAttempt(v: unknown): v is Attempt {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.examCode === "string" &&
    (a.mode === "random" || a.mode === "sequential" || a.mode === "tag") &&
    typeof a.count === "number" &&
    typeof a.startedAt === "number" &&
    typeof a.finishedAt === "number" &&
    typeof a.timerEnabled === "boolean" &&
    typeof a.timerMinutes === "number" &&
    Array.isArray(a.questionNumbers) &&
    typeof a.answers === "object" &&
    a.answers !== null &&
    typeof a.flagged === "object" &&
    a.flagged !== null
  );
}

function parseImportedAttempts(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const file = json as Partial<HistoryExportFile>;
  if (file && Array.isArray(file.attempts)) return file.attempts;
  return [];
}

export function History() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>(() => loadAll());
  const [examFilter, setExamFilter] = useState<string>("all");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(loadAll());
  }, []);

  const examsInHistory = useMemo(() => {
    const set = new Set(rows.map((r) => r.exam));
    return EXAMS.filter((e) => set.has(e.code));
  }, [rows]);

  const visible = examFilter === "all" ? rows : rows.filter((r) => r.exam === examFilter);

  const totals = useMemo(() => {
    let scoreableSum = 0;
    let correctSum = 0;
    for (const r of visible) {
      if (r.score) {
        scoreableSum += r.score.scoreable;
        correctSum += r.score.correct;
      }
    }
    const avgPct = scoreableSum > 0 ? Math.round((correctSum / scoreableSum) * 100) : null;
    return { count: visible.length, avgPct };
  }, [visible]);

  function deleteRow(r: Row) {
    if (!confirm("Delete this attempt?")) return;
    Storage.deleteAttempt(r.exam, r.id);
    setRows(loadAll());
  }

  function exportHistory() {
    if (visible.length === 0) return;
    const payload: HistoryExportFile = {
      exported_at: new Date().toISOString(),
      attempts: visible.map(({ exam: _exam, ...a }) => a),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = examFilter === "all" ? "aws-study-history.json" : `aws-study-history-${examFilter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importHistory(file: File) {
    file
      .text()
      .then((text) => {
        const candidates = parseImportedAttempts(JSON.parse(text));
        const byExam = new Map<string, Attempt[]>();
        let invalid = 0;
        for (const c of candidates) {
          if (!isAttempt(c) || !examByCode(c.examCode)) {
            invalid++;
            continue;
          }
          const list = byExam.get(c.examCode) ?? [];
          list.push(c);
          byExam.set(c.examCode, list);
        }
        let added = 0;
        let skipped = 0;
        for (const [examCode, attempts] of byExam) {
          const result = Storage.addAttempts(examCode, attempts);
          added += result.added;
          skipped += result.skipped;
        }
        setRows(loadAll());
        setImportMsg(
          `Imported ${added} attempt${added === 1 ? "" : "s"}` +
            (skipped > 0 ? `, skipped ${skipped} already-imported` : "") +
            (invalid > 0 ? `, ${invalid} invalid entr${invalid === 1 ? "y" : "ies"} ignored` : "") +
            ".",
        );
      })
      .catch(() => setImportMsg("Import failed: not a valid history file."));
  }

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Practice history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={examFilter === "all" ? "default" : "outline"}
              onClick={() => setExamFilter("all")}
            >
              All exams ({rows.length})
            </Button>
            {examsInHistory.map((e) => {
              const count = rows.filter((r) => r.exam === e.code).length;
              return (
                <Button
                  key={e.code}
                  size="sm"
                  variant={examFilter === e.code ? "default" : "outline"}
                  onClick={() => setExamFilter(e.code)}
                >
                  {e.code.toUpperCase()} ({count})
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportHistory} disabled={visible.length === 0}>
              <Download /> Export{examFilter !== "all" ? ` ${examFilter.toUpperCase()}` : ""}
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importHistory(file);
                e.target.value = "";
              }}
            />
          </div>

          {importMsg && <div className="text-sm text-muted-foreground">{importMsg}</div>}

          {totals.count > 0 && (
            <div className="text-sm text-muted-foreground">
              {totals.count} attempt{totals.count === 1 ? "" : "s"}
              {totals.avgPct !== null && ` · average score ${totals.avgPct}%`}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {visible.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No attempts yet. Finish a session to see it here.
            </CardContent>
          </Card>
        )}
        {visible.map((r) => {
          const dt = new Date(r.finishedAt);
          const pct =
            r.score && r.score.scoreable > 0
              ? Math.round((r.score.correct / r.score.scoreable) * 100)
              : null;
          const meta = examByCode(r.exam);
          return (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Badge variant="secondary">{r.exam.toUpperCase()}</Badge>
                    <span>{dt.toLocaleString()}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {meta?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.mode} · {r.count} Q
                    {r.timerEnabled && ` · timed ${r.timerMinutes}m`}
                    {pct !== null
                      ? ` · ${r.score!.correct}/${r.score!.scoreable} correct (${pct}%)`
                      : " · self-review"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => nav(`/results/${r.exam}/${r.id}`)}
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteRow(r)}
                    aria-label="Delete attempt"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
