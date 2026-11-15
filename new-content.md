# Conversation: Mapping AWS Practice Exam Links on lelongc.github.io

_Exported June 15, 2026_

---

## Q1 — Find related links

**User:** I have this link and want other tests / other exams on the same site:
`https://lelongc.github.io/aws/cer/saa-bonso/001%20AWS%20Certified%20Solutions%20Architect%20Associate%20Practice%20Test%201.html`

**Claude:** Initial attempts to enumerate failed because:

- The domain isn't reachable from the sandbox (egress allowlist).
- `web_fetch` only renders the JavaScript quiz shell (no sibling navigation) and refuses URLs not previously seen.
- A `username.github.io` user-site hypothesis suggested a private repo (clone prompted for credentials; `raw.githubusercontent.com` 404'd on all branches).
- Search engines hadn't indexed the site.

At this point the structure was only inferred (Jon Bonso SAA set, likely Tests 2–6) — not verified.

---

## Q2 — Give me a link for dva-bonso

**Claude:** Guessed `cer/dva-bonso/...` by analogy. **This was wrong** — see below.

---

## Q3 — Wrong link, check for other exams

**Claude:** Stopped guessing and tested an alternative hypothesis: that `aws` is a **project repo** (served at `lelongc.github.io/aws/`), not a folder inside a user-site.

Verified result:

- Repo: **`lelongc/aws`**, branch **`gh-pages`**, **public**.
- Confirmed by `raw.githubusercontent.com/lelongc/aws/gh-pages/cer/saa-bonso/001%20...html` → **HTTP 200**.

Downloaded the `gh-pages` tarball via `codeload.github.com` and enumerated the full file tree. Key finding: **there is no `dva-bonso`** — Bonso only has the SAA set. DVA tests exist under other instructors.

---

## Complete verified inventory

Base URL: `https://lelongc.github.io/aws/cer/`

Exam codes: **SAA** = Solutions Architect Associate · **DVA** = Developer Associate · **SOA** = SysOps Administrator Associate · **SAP** = Solutions Architect Professional · **DOP** = DevOps Engineer Professional

### Jon Bonso
| Exam | Count | Type | Path pattern |
|------|-------|------|--------------|
| SAA | 6 | `.html` | `saa-bonso/00N%20AWS%20Certified%20Solutions%20Architect%20Associate%20Practice%20Test%20N.html` |

### Stephane Maarek
| Exam | Count | Type | Path pattern |
|------|-------|------|--------------|
| SAA | 6 | `.html` | `stephane/saa-stephane-maarek/N.N%20Practice%20Test%20N%20-%20AWS%20Certified%20Solutions%20Architect%20Associate.html` |
| DVA | 6 | `.mhtml` | `stephane/dva-stephane/de1.mhtml` → `de6.mhtml` |
| SOA | 4 | `.mhtml` | `stephane/soa-stephane/de1.mhtml` → `de4.mhtml` |
| SAP | 3 | `.mhtml` | `stephane/sap-stephane/de1.mhtml` → `de3.mhtml` |
| DOP | 2 | `.mhtml` | `stephane/dop-stephane/de1.mhtml` → `de2.mhtml` |

### Neal Davis
| Exam | Count | Type | Path pattern |
|------|-------|------|--------------|
| SAA | 6 | `.mhtml` | `nealDavis/saa-nealdavis/de1.mhtml` → `de6.mhtml` |
| DVA | 6 | `.mhtml` | `nealDavis/dva-nealdavis/de1.mhtml` → `de6.mhtml` |
| SOA | 5 | `.mhtml` | `nealDavis/soa-nealdavis/de1.mhtml` → `de5.mhtml` |
| SAP | 6 | `.mhtml` | `nealDavis/sap-nealdavis/de1.mhtml` → `de6.mhtml` |
| DOP | 6 | `.mhtml` | `nealDavis/dop-nealdavis/de1.mhtml` → `de6.mhtml` |

### DVA links (the original ask)
```
https://lelongc.github.io/aws/cer/nealDavis/dva-nealdavis/de1.mhtml   (de1–de6)
https://lelongc.github.io/aws/cer/stephane/dva-stephane/de1.mhtml     (de1–de6)
```

---

## Notes

- `.mhtml` files are saved web-archives. Chrome/Edge open them natively; Firefox needs an extension.
- The repo also contains non-quiz material:
  - `saa-cantrill-and-lab/` — Adrian Cantrill SAA course notes + hands-on labs
  - `lab/` — IAM hands-on labs
  - `orther-note/` — security notes (e.g. AWS Inspector)