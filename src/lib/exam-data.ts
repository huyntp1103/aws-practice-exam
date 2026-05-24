import type { ExamBank, ExplanationsFile, UncertainBank } from "./types";

const bankCache = new Map<string, Promise<ExamBank>>();
const uncertainCache = new Map<string, Promise<UncertainBank | null>>();
const explanationsSeedCache = new Map<string, Promise<ExplanationsFile | null>>();

/**
 * Load an exam's question bank. The new layout is data/<exam>/questions.json;
 * the old flat layout (questions_<exam>_answer.json) is kept as a fallback so
 * already-deployed builds keep working.
 */
export function loadExamBank(examCode: string): Promise<ExamBank> {
  if (bankCache.has(examCode)) return bankCache.get(examCode)!;

  const p = (async () => {
    const candidates = [
      `/${examCode}/questions.json`,
      `/questions_${examCode}_answer.json`,
      `/questions_${examCode}.json`,
    ];
    let lastErr: unknown = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastErr = new Error(`${url} -> ${res.status}`);
          continue;
        }
        return (await res.json()) as ExamBank;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      `Could not load question bank for "${examCode}". ` +
        `Expected /${examCode}/questions.json. ` +
        `Last error: ${String(lastErr)}`
    );
  })();

  bankCache.set(examCode, p);
  return p;
}

/**
 * Load uncertain-answer notes for an exam. Returns null when the file isn't
 * present (the exam has no flagged questions).
 */
export function loadUncertain(examCode: string): Promise<UncertainBank | null> {
  if (uncertainCache.has(examCode)) return uncertainCache.get(examCode)!;

  const p = (async () => {
    try {
      const res = await fetch(`/${examCode}/uncertain.json`);
      if (!res.ok) return null;
      return (await res.json()) as UncertainBank;
    } catch {
      return null;
    }
  })();

  uncertainCache.set(examCode, p);
  return p;
}

/**
 * Load optional pre-baked AI explanations for an exam. Returns null when the
 * file isn't present. Acts as a seed that can be merged with the localStorage
 * cache so explanations can be shared across browsers/devices (commit the
 * exported JSON to data/<exam>/explanations.json).
 */
export function loadExplanationsSeed(examCode: string): Promise<ExplanationsFile | null> {
  if (explanationsSeedCache.has(examCode)) return explanationsSeedCache.get(examCode)!;

  const p = (async () => {
    try {
      const res = await fetch(`/${examCode}/explanations.json`);
      if (!res.ok) return null;
      return (await res.json()) as ExplanationsFile;
    } catch {
      return null;
    }
  })();

  explanationsSeedCache.set(examCode, p);
  return p;
}
