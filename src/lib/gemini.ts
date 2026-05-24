import type { RawQuestion } from "./types";
import { normalizeAnswer } from "./session";

// Models to try, in order. If the first 404s or returns an "unsupported"
// error, fall back to the next.
export const MODELS = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite"];
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function buildPrompt(q: RawQuestion, answerKey: string[]): string {
  const options = Object.keys(q.options)
    .sort()
    .map((L) => `${L}. ${q.options[L]}`)
    .join("\n");
  return [
    "You are an AWS certification tutor.",
    "In under 120 words, explain why the correct answer(s) below are right.",
    "If a wrong option is a common distractor, briefly say why it's wrong.",
    "Plain text only — no markdown headings, no preamble.",
    "",
    "Question:",
    q.question,
    "",
    "Options:",
    options,
    "",
    `Correct answer: ${answerKey.join(", ")}`,
  ].join("\n");
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { code?: number; message?: string; status?: string };
}

async function callOnce(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; model: string }> {
  const url = `${BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // Latency budget tuned for short tutor-style explanations:
        // - thinkingBudget: 0 disables the "thinking" reasoning pass on
        //   Gemini 2.5+ models, which is the single biggest latency win for
        //   short answers. (No-op on models that don't support thinking.)
        // - candidateCount: 1 prevents the server from generating extras.
        // - maxOutputTokens caps at ~200 — the prompt asks for under 120 words
        //   (~160-180 tokens), so 200 is a tight ceiling that ends generation
        //   as soon as the model is done instead of running to a larger limit.
        // - low temperature keeps the response focused (also slightly faster
        //   sampling).
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 200,
        candidateCount: 1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const json = (await res.json()) as GeminiResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    const status = json.error?.status ?? String(res.status);
    const err = new Error(`Gemini (${model}): ${msg}`);
    (err as Error & { code?: number; status?: string }).code = json.error?.code ?? res.status;
    (err as Error & { code?: number; status?: string }).status = status;
    throw err;
  }
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  if (!text) throw new Error(`Gemini (${model}): empty response`);
  return { text, model };
}

function shouldFallback(e: unknown): boolean {
  const err = e as { code?: number; status?: string; message?: string };
  if (err.code === 404) return true;
  if (err.status && /(NOT_FOUND|UNSUPPORTED|UNIMPLEMENTED|INVALID_ARGUMENT)/i.test(err.status)) {
    return true;
  }
  if (err.message && /not found|unsupported|does not exist/i.test(err.message)) {
    return true;
  }
  return false;
}

/**
 * Ask Gemini for a short explanation. Tries each model in MODELS in order.
 * Throws on hard failure (bad key, network down, all models rejected, etc.).
 */
export async function explainQuestion(
  apiKey: string,
  q: RawQuestion,
): Promise<{ text: string; model: string }> {
  const key = normalizeAnswer(q.answer);
  if (!key) throw new Error("Question has no answer key — nothing to explain.");
  if (!apiKey) throw new Error("Gemini API key not set. Add it in Settings.");

  const prompt = buildPrompt(q, key);
  let lastErr: unknown = null;
  for (const model of MODELS) {
    try {
      return await callOnce(apiKey, model, prompt);
    } catch (e) {
      lastErr = e;
      if (!shouldFallback(e)) throw e;
    }
  }
  throw lastErr ?? new Error("All Gemini models failed");
}
