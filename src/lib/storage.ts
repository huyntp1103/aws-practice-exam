import type { Attempt, SessionState, UserPrefs } from "./types";

const K = {
  prefs: "aws-study:prefs",
  session: (examCode: string) => `aws-study:session:${examCode}`,
  attempts: (examCode: string) => `aws-study:attempts:${examCode}`,
  flags: (examCode: string) => `aws-study:flags:${examCode}`,
};

const DEFAULT_PREFS: UserPrefs = {
  theme: "light",
  defaultMode: "random",
  defaultCount: 25,
  defaultTimerEnabled: false,
  defaultTimerMinutes: 130,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode — ignore
  }
}

export const Storage = {
  getPrefs(): UserPrefs {
    return { ...DEFAULT_PREFS, ...read<Partial<UserPrefs>>(K.prefs, {}) };
  },
  setPrefs(prefs: UserPrefs) {
    write(K.prefs, prefs);
  },

  getSession(examCode: string): SessionState | null {
    return read<SessionState | null>(K.session(examCode), null);
  },
  setSession(examCode: string, state: SessionState) {
    write(K.session(examCode), state);
  },
  clearSession(examCode: string) {
    localStorage.removeItem(K.session(examCode));
  },

  getAttempts(examCode: string): Attempt[] {
    return read<Attempt[]>(K.attempts(examCode), []);
  },
  addAttempt(examCode: string, attempt: Attempt) {
    const list = Storage.getAttempts(examCode);
    list.unshift(attempt);
    // cap at last 50
    write(K.attempts(examCode), list.slice(0, 50));
  },
  getAttempt(examCode: string, id: string): Attempt | undefined {
    return Storage.getAttempts(examCode).find((a) => a.id === id);
  },
  deleteAttempt(examCode: string, id: string) {
    const list = Storage.getAttempts(examCode).filter((a) => a.id !== id);
    write(K.attempts(examCode), list);
  },

  getFlags(examCode: string): Record<number, true> {
    return read<Record<number, true>>(K.flags(examCode), {});
  },
  setFlag(examCode: string, qNum: number, flagged: boolean) {
    const flags = Storage.getFlags(examCode);
    if (flagged) flags[qNum] = true;
    else delete flags[qNum];
    write(K.flags(examCode), flags);
  },
};
