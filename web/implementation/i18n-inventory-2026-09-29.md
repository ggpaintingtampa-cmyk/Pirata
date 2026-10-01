# Interface-string inventory — update 2026-09-29 (P13)

Scope: the live app (`src/live/**`, every feature the live shell mounts, shared components the live shell uses). The browser demo (`src/App.tsx`, `features/today`, `features/dialogs`, `features/quick-add`, `components/Modal`, `components/StorageNotice`) is not part of P13 and keeps its English text.

## Mechanisms
- Keyed dictionaries (`i18n/shell.ts`, `features/*/strings.ts`) through `useT()` for the shell and the newer modules.
- Legacy phrases through `tx('English phrase')` with Spanish in `i18n/legacy.ts` (keyed by the English text). Every `tx()` literal must have an entry; `tests/unit/i18n-parity.test.ts` enforces it, and also allows a `shell.*` key through `tx()`.
- Server validation and handler messages through `i18n/fields.ts` (`fieldMessage`), error codes through `i18n/errors.ts`.
- Business content (task titles, notes, messages…) through `TranslatedText` / `useTranslated` (never through dictionaries).

## Sweep result
- Converted in this pass (all now `tx()` or keyed): task dialogs and editors (`tasks-time/index.tsx`, `TaskChecklist`, `WorkForm`, `WorkDialog`, `live/dialogs.tsx`), timer and session prompts, All tasks, Calendar (`planning/CalendarView.tsx`, `planning/index.tsx`), Updates/notes/files (`collaboration/*`), Ask page, AI settings, Data tools, Hours, Pay, Tools, Trash delete button, sign-in screen, record forms and modals (clients/projects, inventory, spending), error boundary.
- `window.confirm` call sites moved to `ConfirmDialog`: `DeleteButton`, `work/index.tsx` node check, hours shift row, tools status.
- Spanish added for 193 phrases in `legacy.ts`.

## Intentionally left in English
- Product name "Morgan el Pirata", provider model IDs and placeholders such as `gpt-4o-mini`, ISO timestamp examples, code-like values (`2026-09-17T13:00:00.000Z`).
- Developer diagnostics written to the console.
- The browser demo surfaces listed above.

## Review still owed (phase 7)
- Bilingual read-through of the synthetic Spanish in `legacy.ts` and the feature dictionaries.
- Rendered layout check at 320 / 390 / 768 / desktop for the longer Spanish strings (buttons in `WorkBar`, calendar toolbar, settings cards).
