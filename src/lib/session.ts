import type { Attempt, ExamBank, RawQuestion, SessionConfig, SessionState } from "./types";

export function normalizeAnswer(answer: string | string[] | undefined): string[] | null {
  if (answer == null) return null;
  if (Array.isArray(answer)) return [...answer].sort();
  return [answer];
}

export function isMulti(q: RawQuestion): boolean {
  return Array.isArray(q.answer) && q.answer.length > 1;
}

export function hasAnswerKey(bank: ExamBank): boolean {
  return bank.questions.some((q) => q.answer !== undefined);
}

export function pickRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

export function buildSession(bank: ExamBank, opts: {
  mode: SessionConfig["mode"];
  count: number;
  timerEnabled: boolean;
  timerMinutes: number;
}): SessionState {
  const allNumbers = bank.questions.map((q) => q.number);
  const questionNumbers =
    opts.mode === "random" ? pickRandom(allNumbers, opts.count) : allNumbers.slice();

  const startedAt = Date.now();
  const endsAt = opts.timerEnabled
    ? startedAt + opts.timerMinutes * 60_000
    : undefined;

  return {
    config: {
      examCode: bank.exam_code ?? bank.exam,
      mode: opts.mode,
      count: questionNumbers.length,
      timerEnabled: opts.timerEnabled,
      timerMinutes: opts.timerMinutes,
      startedAt,
      questionNumbers,
    },
    currentIndex: 0,
    answers: {},
    flagged: {},
    revealed: {},
    finished: false,
    endsAt,
  };
}

export function isCorrect(q: RawQuestion, picked: string[] | undefined): boolean | null {
  const key = normalizeAnswer(q.answer);
  if (!key) return null;
  if (!picked || picked.length === 0) return false;
  const sorted = [...picked].sort();
  if (sorted.length !== key.length) return false;
  return sorted.every((v, i) => v === key[i]);
}

export function scoreAttempt(
  bank: ExamBank,
  state: SessionState,
): Attempt["score"] {
  let correct = 0;
  let scoreable = 0;
  const byNum = new Map(bank.questions.map((q) => [q.number, q]));
  for (const qNum of state.config.questionNumbers) {
    const q = byNum.get(qNum);
    if (!q) continue;
    const result = isCorrect(q, state.answers[qNum]);
    if (result === null) continue;
    scoreable += 1;
    if (result) correct += 1;
  }
  return { correct, scoreable, total: state.config.questionNumbers.length };
}

export function makeAttempt(state: SessionState, bank: ExamBank): Attempt {
  return {
    id: `att_${state.config.startedAt}_${Math.random().toString(36).slice(2, 8)}`,
    examCode: state.config.examCode,
    mode: state.config.mode,
    count: state.config.count,
    startedAt: state.config.startedAt,
    finishedAt: state.finishedAt ?? Date.now(),
    timerEnabled: state.config.timerEnabled,
    timerMinutes: state.config.timerMinutes,
    questionNumbers: state.config.questionNumbers,
    answers: state.answers,
    flagged: state.flagged,
    score: scoreAttempt(bank, state),
  };
}
