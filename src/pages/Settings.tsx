import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Eye, EyeOff, Save, Sparkles, Trash2 } from "lucide-react";

import { EXAMS } from "@/lib/exams";
import { Storage } from "@/lib/storage";
import { MODELS } from "@/lib/gemini";
import type { ExplanationsFile } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Practical browser localStorage budget. Spec-mandated max varies (5–10 MB);
// 5 MB is the safe assumption for showing how close we are to the ceiling.
const STORAGE_BUDGET = 5 * 1024 * 1024;

export function Settings() {
  const [apiKey, setApiKey] = useState(() => Storage.getGeminiKey());
  const [revealKey, setRevealKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState(() => Storage.usage());

  function refresh() {
    const c: Record<string, number> = {};
    for (const e of EXAMS) {
      c[e.code] = Object.keys(Storage.getExplanations(e.code)).length;
    }
    setCounts(c);
    setUsage(Storage.usage());
  }

  useEffect(() => {
    refresh();
  }, []);

  function save() {
    Storage.setGeminiKey(apiKey.trim());
    setSaved(true);
    refresh();
    window.setTimeout(() => setSaved(false), 1500);
  }

  function clearKey() {
    if (!confirm("Remove the saved Gemini API key?")) return;
    Storage.setGeminiKey("");
    setApiKey("");
    refresh();
  }

  function downloadExplanations(examCode: string): boolean {
    const items = Storage.getExplanations(examCode);
    if (Object.keys(items).length === 0) return false;
    const payload: ExplanationsFile = {
      exam_code: examCode,
      note:
        "AI-generated explanations cached client-side. Commit this file to " +
        "data/<exam>/explanations.json to share across devices.",
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `explanations.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  function exportAndClear(examCode: string) {
    if (!confirm(
      `Download ${examCode.toUpperCase()} explanations and remove them from this browser? ` +
      `Make sure to commit the downloaded file to data/${examCode}/explanations.json ` +
      `before relying on it.`,
    )) return;
    if (!downloadExplanations(examCode)) return;
    Storage.clearExplanations(examCode);
    refresh();
  }

  function clearExplanations(examCode: string) {
    if (!confirm(`Clear cached explanations for ${examCode.toUpperCase()}? Not exported — they'll be re-generated on next Explain.`)) return;
    Storage.clearExplanations(examCode);
    refresh();
  }

  function clearAll() {
    if (!confirm(
      "Remove ALL aws-study data from this browser: API key, attempts, flags, " +
      "explanations, prefs. This cannot be undone.",
    )) return;
    Storage.clearAll();
    setApiKey("");
    refresh();
  }

  const usagePct = Math.min(100, Math.round((usage.total / STORAGE_BUDGET) * 100));

  return (
    <div className="container max-w-3xl py-6 space-y-4">
      {/* Gemini API */}
      <Card>
        <CardHeader>
          <CardTitle>Gemini API</CardTitle>
          <CardDescription>
            Used to generate short explanations on the Results page. Your key is
            stored only in this browser's localStorage and is sent directly to
            Google's API from the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-key">GEMINI_API_KEY</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type={revealKey ? "text" : "password"}
                value={apiKey}
                placeholder="AIza…"
                autoComplete="off"
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRevealKey((v) => !v)}
                aria-label={revealKey ? "Hide key" : "Show key"}
                type="button"
              >
                {revealKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get a key from{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Google AI Studio
              </a>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={!apiKey && !Storage.getGeminiKey()}>
              <Save /> {saved ? "Saved" : "Save"}
              {saved && <Check className="ml-1 h-4 w-4 text-success" />}
            </Button>
            {Storage.getGeminiKey() && (
              <Button variant="ghost" onClick={clearKey}>
                <Trash2 /> Remove key
              </Button>
            )}
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Models tried (in order):</span>{" "}
              <span className="font-mono">{MODELS.join(" → ")}</span>
            </div>
            <div>
              If the first model returns "not found" / "unsupported," the second
              is used as fallback.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cached explanations */}
      <Card>
        <CardHeader>
          <CardTitle>Cached explanations</CardTitle>
          <CardDescription>
            <span className="font-medium">Export &amp; clear</span> downloads{" "}
            <span className="font-mono">explanations.json</span> and then removes
            it from this browser so localStorage stays small. Commit the
            downloaded file to{" "}
            <span className="font-mono">data/&lt;exam&gt;/explanations.json</span>{" "}
            — it'll re-seed on every device on next page load.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {EXAMS.map((e) => {
            const n = counts[e.code] ?? 0;
            return (
              <div
                key={e.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{e.code.toUpperCase()}</div>
                  <div className="text-xs text-muted-foreground">
                    {n} cached explanation{n === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Link to={`/explanations?exam=${e.code}`}>
                    <Button variant="ghost" size="sm" aria-label="View explanations">
                      <Sparkles /> View
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportAndClear(e.code)}
                    disabled={n === 0}
                  >
                    <Download /> Export &amp; clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearExplanations(e.code)}
                    disabled={n === 0}
                    aria-label="Clear without exporting"
                    title="Clear without exporting"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Storage usage */}
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>
            Browser localStorage usage for this app. The hard ceiling is
            typically 5–10&nbsp;MB per origin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold tabular-nums">
              {formatBytes(usage.total)}
            </div>
            <div className="text-xs text-muted-foreground">
              ~{usagePct}% of {formatBytes(STORAGE_BUDGET)} budget
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${usagePct}%` }}
            />
          </div>

          {usage.byKey.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Show per-key breakdown ({usage.byKey.length} keys)
              </summary>
              <div className="mt-2 space-y-0.5 font-mono">
                {usage.byKey.map((row) => (
                  <div key={row.key} className="flex justify-between gap-2">
                    <span className="truncate">{row.key}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatBytes(row.bytes)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Nuclear option — wipes everything aws-study has stored in this
              browser.
            </div>
            <Button variant="destructive" size="sm" onClick={clearAll}>
              <Trash2 /> Clear all data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
