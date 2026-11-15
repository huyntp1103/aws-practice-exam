# Design References

Reference material pulled from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for the AWS exam practice web app.

## Layout

- **ui-styling/** — shadcn/ui + Tailwind cookbooks
  - `shadcn-components.md` — component catalog & usage
  - `shadcn-theming.md` — theming tokens, dark mode
  - `shadcn-accessibility.md` — a11y patterns
  - `tailwind-utilities.md` — utility class reference
  - `tailwind-responsive.md` — breakpoints, responsive design
  - `tailwind-customization.md` — config customization
  - `SKILL.md` — overview / when to apply

- **design-system/** — design token architecture
  - `primitive-tokens.md` / `semantic-tokens.md` / `component-tokens.md` — 3-layer token model
  - `token-architecture.md` — how the layers compose
  - `component-specs.md` — spec format for components
  - `states-and-variants.md` — interactive states (hover/focus/disabled), variants
  - `tailwind-integration.md` — how tokens wire into Tailwind
  - `SKILL.md` — overview

## Likely useful for the practice web

For a question-bank practice site: shadcn components (Card, Button, RadioGroup, Checkbox, Progress, Tabs), Tailwind responsive utilities, and semantic tokens for question/answer states (correct / incorrect / unanswered / flagged-for-review).
