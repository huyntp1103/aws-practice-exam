import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { EXAMS } from "@/lib/exams";
import { loadExamBank, loadExplanationsSeed } from "@/lib/exam-data";
import { Storage } from "@/lib/storage";
import { normalizeAnswer } from "@/lib/session";
import type { ExamBank, Explanation, RawQuestion } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Source = "seed" | "local" | "both";

interface Row {
  qNum: number;
  source: Source;
  explanation: Explanation;
  questionPreview: string;
}

export function Explanations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examFilter = searchParams.get("exam") ?? EXAMS[0].code;
  const sourceFilter = (searchParams.get("source") as Source | "all" | null) ?? "all";

  const [bank, setBank] = useState<ExamBank | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [openQ, setOpenQ] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setBank(null);
    setRows([]);
    setErr(null);
    setOpenQ(null);

    Promise.all([loadExamBank(examFilter), loadExplanationsSeed(examFilter)])
      .then(([b, seed]) => {
        const seedItems = seed?.items ?? {};
        const local = Storage.getExplanations(examFilter);
        const allKeys = new Set([...Object.keys(seedItems), ...Object.keys(local)]);
        const byNum = new Map(b.questions.map((q) => [q.number, q]));

        const list: Row[] = [];
        for (const key of allKeys) {
          const qNum = Number(key);
          const q = byNum.get(qNum);
          if (!q) continue;
          const fromSeed = !!seedItems[key];
          const fromLocal = !!local[key];
          // local wins on conflict — same logic as Results.tsx
          const explanation = local[key] ?? seedItems[key];
          const preview = q.question.replace(/\s+/g, " ").slice(0, 160);
          list.push({
            qNum,
            source: fromSeed && fromLocal ? "both" : fromLocal ? "local" : "seed",
            explanation,
            questionPreview: preview,
          });
        }
        list.sort((a, b) => a.qNum - b.qNum);
        setBank(b);
        setRows(list);
      })
      .catch((e) => setErr(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, [examFilter]);

  const byNum = useMemo(() => {
    if (!bank) return new Map<number, RawQuestion>();
    return new Map(bank.questions.map((q) => [q.number, q]));
  }, [bank]);

  const visible = rows.filter((r) => {
    if (sourceFilter === "all") return true;
    if (sourceFilter === "seed") return r.source !== "local";
    if (sourceFilter === "local") return r.source !== "seed";
    return true;
  });

  const counts = {
    all: rows.length,
    seed: rows.filter((r) => r.source !== "local").length,
    local: rows.filter((r) => r.source !== "seed").length,
  };

  function setExam(code: string) {
    setSearchParams((p) => {
      p.set("exam", code);
      return p;
    });
  }
  function setSource(s: Source | "all") {
    setSearchParams((p) => {
      if (s === "all") p.delete("source");
      else p.set("source", s);
      return p;
    });
  }

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Explanations</CardTitle>
          <CardDescription>
            AI explanations loaded at app start from{" "}
            <span className="font-mono">data/&lt;exam&gt;/explanations.json</span>{" "}
            plus any you've cached locally. <span className="font-medium">local</span>{" "}
            wins on conflict (same as the Results page).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Exam</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {EXAMS.map((e) => (
                <Button
                  key={e.code}
                  size="sm"
                  variant={examFilter === e.code ? "default" : "outline"}
                  onClick={() => setExam(e.code)}
                >
                  {e.code.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Source</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={sourceFilter === "all" ? "default" : "outline"}
                onClick={() => setSource("all")}
              >
                All ({counts.all})
              </Button>
              <Button
                size="sm"
                variant={sourceFilter === "seed" ? "default" : "outline"}
                onClick={() => setSource("seed")}
              >
                From seed ({counts.seed})
              </Button>
              <Button
                size="sm"
                variant={sourceFilter === "local" ? "default" : "outline"}
                onClick={() => setSource("local")}
              >
                From local ({counts.local})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {err && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!loading && visible.length === 0 && !err && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No explanations match this filter.
            {counts.all === 0 && (
              <>
                {" "}
                Click <span className="font-medium">Explain</span> on a question in
                a session's Results page to generate one.
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((r) => {
          const open = openQ === r.qNum;
          const q = byNum.get(r.qNum);
          const key = q ? normalizeAnswer(q.answer) : null;
          return (
            <Card key={r.qNum}>
              <CardContent className="py-4 space-y-2">
                <button
                  className="w-full text-left"
                  onClick={() => setOpenQ(open ? null : r.qNum)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">#{r.qNum}</Badge>
                    <SourceBadge source={r.source} />
                    {key && (
                      <span className="text-xs text-muted-foreground">
                        answer: <span className="font-mono">{key.join(", ")}</span>
                      </span>
                    )}
                    {r.explanation.createdAt > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(r.explanation.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm">{r.questionPreview}</div>
                </button>

                {open && q && (
                  <div className="space-y-2 pt-2">
                    <div className="whitespace-pre-wrap text-sm">{q.question}</div>

                    <div className="space-y-1">
                      {Object.keys(q.options)
                        .sort()
                        .map((L) => {
                          const isAns = key?.includes(L);
                          return (
                            <div
                              key={L}
                              className={
                                "rounded-md border p-2 text-xs " +
                                (isAns ? "border-success bg-success/10" : "")
                              }
                            >
                              <span className="font-mono font-medium">{L}.</span>{" "}
                              {q.options[L]}
                            </div>
                          );
                        })}
                    </div>

                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" /> AI explanation
                        </span>
                        {r.explanation.createdAt > 0 && (
                          <span className="text-muted-foreground">
                            {new Date(r.explanation.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap">{r.explanation.text}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "both") {
    return (
      <Badge variant="outline" title="In both seed and local cache; local wins.">
        seed + local
      </Badge>
    );
  }
  if (source === "local") {
    return (
      <Badge variant="outline" title="Cached in this browser only.">
        local
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title="From the committed seed file.">
      seed
    </Badge>
  );
}
