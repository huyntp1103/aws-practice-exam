export type Letter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface RawQuestion {
  number: number;
  accuracy_percent: number;
  votes: number;
  question: string;
  options: Record<string, string>;
  answer?: string | string[];
}

export interface ExamBank {
  source: string;
  exam: string;
  exam_code?: string;
  total: number;
  note?: string;
  questions: RawQuestion[];
}

export interface ExamMeta {
  code: string;       // e.g. "saa-c03"
  name: string;       // display
}

export type Mode = "random" | "sequential";

export interface SessionConfig {
  examCode: string;
  mode: Mode;
  count: number;        // for random; for sequential = bank size
  timerEnabled: boolean;
  timerMinutes: number; // total minutes when enabled
  startedAt: number;    // unix ms
  questionNumbers: number[]; // ordered question numbers for this session
}

export interface SessionState {
  config: SessionConfig;
  currentIndex: number;
  answers: Record<number, string[]>; // qNumber -> selected letters (sorted)
  flagged: Record<number, true>;
  revealed: Record<number, true>;
  finished: boolean;
  finishedAt?: number;
  endsAt?: number; // unix ms, only when timer enabled
}

export interface Attempt {
  id: string;
  examCode: string;
  mode: Mode;
  count: number;
  startedAt: number;
  finishedAt: number;
  timerEnabled: boolean;
  timerMinutes: number;
  questionNumbers: number[];
  answers: Record<number, string[]>;
  flagged: Record<number, true>;
  score?: { correct: number; scoreable: number; total: number };
}

export interface UserPrefs {
  theme: "light" | "dark" | "system";
  defaultMode: Mode;
  defaultCount: number;
  defaultTimerEnabled: boolean;
  defaultTimerMinutes: number;
}

export interface UncertainItem {
  number: number;
  picked: string | string[] | null;
  note: string;
}

export interface UncertainBank {
  exam_code: string;
  note?: string;
  items: UncertainItem[];
}

export interface Explanation {
  text: string;
  createdAt: number;
}

// Shape of the optional data/<exam>/explanations.json seed file the app can
// pre-load to share explanations across browsers/devices.
export interface ExplanationsFile {
  exam_code: string;
  note?: string;
  // map of question number (string key) -> explanation
  items: Record<string, Explanation>;
}
