import type { Attempt, Explanation, SessionState, UserPrefs } from "./types";

const K = {
  prefs: "aws-study:prefs",
  session: (examCode: string) => `aws-study:session:${examCode}`,
  attempts: (examCode: string) => `aws-study:attempts:${examCode}`,
  flags: (examCode: string) => `aws-study:flags:${examCode}`,
  geminiKey: "aws-study:gemini-key",
  explanations: (examCode: string) => `aws-study:explanations:${examCode}`,
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
    // cap at last 30
    write(K.attempts(examCode), list.slice(0, 30));
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

  // --- Gemini API key (plain localStorage; treat as semi-secret) ---
  getGeminiKey(): string {
    try {
      return localStorage.getItem(K.geminiKey) ?? "";
    } catch {
      return "";
    }
  },
  setGeminiKey(key: string) {
    try {
      if (key) localStorage.setItem(K.geminiKey, key);
      else localStorage.removeItem(K.geminiKey);
    } catch {
      // ignore
    }
  },

  // --- AI explanations cache (per-exam, keyed by question number) ---
  getExplanations(examCode: string): Record<string, Explanation> {
    return read<Record<string, Explanation>>(K.explanations(examCode), {});
  },
  setExplanation(examCode: string, qNum: number, exp: Explanation) {
    const all = Storage.getExplanations(examCode);
    all[String(qNum)] = exp;
    write(K.explanations(examCode), all);
  },
  clearExplanations(examCode: string) {
    localStorage.removeItem(K.explanations(examCode));
  },

  // --- Usage / nuclear actions ---
  /**
   * Return aws-study:* localStorage usage in bytes, broken down by key.
   * UTF-16 chars are counted as 2 bytes each (matches what the browser
   * actually stores) so the number is conservative-ish.
   */
  usage(): { byKey: Array<{ key: string; bytes: number }>; total: number } {
    const byKey: Array<{ key: string; bytes: number }> = [];
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("aws-study:")) continue;
        const v = localStorage.getItem(k) ?? "";
        const bytes = (k.length + v.length) * 2;
        byKey.push({ key: k, bytes });
        total += bytes;
      }
    } catch {
      // ignore
    }
    byKey.sort((a, b) => b.bytes - a.bytes);
    return { byKey, total };
  },

  /** Wipe every aws-study:* key. Caller is responsible for the confirm. */
  clearAll() {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("aws-study:")) doomed.push(k);
      }
      for (const k of doomed) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};
