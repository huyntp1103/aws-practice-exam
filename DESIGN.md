# Design decisions

Project-specific design choices and rationale. Source of truth for *why*; the code is the source of truth for *what*.

For general shadcn / Tailwind reference, see [.claude/design-refs/](.claude/design-refs/).

## Theme

Default is **light** — user preference. System and dark are user-selectable via the header toggle. Theme value is persisted in `localStorage`.

## Semantic tokens

The shadcn defaults ship only `destructive`. We added two more because the app needs richer correctness states. All four are HSL CSS variables in [src/index.css](src/index.css), wired into Tailwind via [tailwind.config.ts](tailwind.config.ts).

| Token | Used for |
| --- | --- |
| `primary` | AWS orange — primary actions, selected state, progress bar |
| `success` | Correct answer reveal, "answer key available" indicators |
| `warning` | Flagged questions, "Double-check" uncertain notes, timer urgency (<5min) |
| `destructive` | User's incorrect pick (on reveal), destructive actions, timer expired |

**Don't repurpose `destructive` for warnings.** "User is wrong" and "double-check this" must read as different states.

## State colors (must stay consistent)

| Visual | Meaning |
| --- | --- |
| `success` row tint on an option | Correct answer (only on reveal) |
| `destructive` row tint on an option | User's pick that is wrong (only on reveal) |
| Primary-tinted jumper square | Question has been answered |
| Yellow dot on jumper square | Flagged for review |
| Ring around jumper square | Current question |
| `warning` "Double-check" badge | Question is in `uncertain.json` |
| `warning` timer border | <5 min remaining |
| `destructive` timer border | Expired (auto-submit) |

When adding a new state, give it a *new* visual. Don't overload an existing color.

## Component choices

| Need | Picked | Why |
| --- | --- | --- |
| Exam picker | Native `<select>` | Six options; shadcn Select would be overkill |
| Single-answer options | shadcn `RadioGroup` in row-style labels | Whole row clickable |
| Multi-answer options | shadcn `Checkbox` in row-style labels | Auto-selected when `Array.isArray(answer)` |
| Timer toggle | shadcn `Switch` + numeric `Input` | Minutes input only renders when toggle is on |
| Question jumper | Custom grid in [JumperGrid.tsx](src/components/JumperGrid.tsx) | Tight color-coded squares; no shadcn primitive fits |
| Confirms | `window.confirm()` | All confirms are trivial; not worth a Dialog |

**Avoid** introducing Dialog, Select, Tabs, Accordion, or ScrollArea until there's a concrete need. Keep the surface small.

## Layout

- Session view is two-column on `md+`: question card left, sticky jumper card right (~220px). Single column on mobile.
- Question text uses `whitespace-pre-wrap` — scraped prompts contain meaningful line breaks.
- Option letters render in `font-mono` for visual anchoring; numeric displays (timer, score, stat counters) use `tabular-nums`.
- Container widths: Home/Results narrower (`max-w-3xl`/`4xl`), Session wider (`max-w-5xl`) to fit the jumper.

## Persistence

Everything in `localStorage`, keyed under `aws-study:*` ([src/lib/storage.ts](src/lib/storage.ts)):

- `aws-study:prefs` — global (theme + session defaults)
- `aws-study:session:<exam>` — in-progress session (resumable)
- `aws-study:attempts:<exam>` — completed attempts, capped at 50
- `aws-study:flags:<exam>` — flagged questions

No server, no IndexedDB, no third-party storage. If cross-device sync is ever needed, that's a separate decision.

## Accessibility

- All interactive elements use shadcn's built-in focus rings.
- Keyboard shortcuts in session ([src/pages/Session.tsx](src/pages/Session.tsx)): A–H pick option, ←/→ navigate, F flag, R reveal. The handler skips events while a text input is focused.
- Color contrast was verified visually only — not via automated audit.

## Intentionally excluded

So future "add X?" requests get a quick scope check:

- Auth, accounts, multi-user
- Leaderboards, sharing, analytics
- Backend of any kind
- In-app question editing — author in `data/<exam>/questions.json`
- PWA install / service worker
