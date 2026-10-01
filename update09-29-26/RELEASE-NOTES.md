# Update 2026-09-29 — release notes (draft for the owner)

## Pirata
- **English / Spanish throughout.** Choose the language on Settings or the sign-in screen. Everything the team writes (task titles, notes, questions, updates, materials, templates) is translated once by the server and reused; the original is always one tap away, a translation can be reported and corrected, and the language a note was written in can be stated. Search works in your language. CSV exports can carry the translated text with the original beside it. The owner sets the provider, model and allowance on Translation settings and keeps a glossary of trade terms.
- **Daily list.** Grouped by scheduled time, then project (By project is one tap away); Unscheduled last; numbered in the order shown; Set time on a card; “Ask the team” replaces “Ask a question” and names who receives it.
- **Reliable saves.** A save never settles on an older snapshot; uncertain saves offer “Retry same action” and cannot duplicate; a small Refresh button sits by the date (and in the brand bar on project pages).
- **Hours.** Add hours from any calendar day; Who worked above the day's tasks; day entries show as days with their 8-hour total.
- **Templates with materials and tools.** Templates and tasks list what to bring; applying a template copies the list into each task; templates are editable (versioned) without touching tasks already created; Bring → Request prefills a material request.
- **Bulk copy and owner bulk delete.** Select tasks → Copy to… (tree, requirements, estimates and notes; history never); the owner can Move to trash a reviewed selection and restore the whole batch.
- **Connections.** The owner creates a work-feed token for one account so Camino can read that account's assigned work and, when allowed, mark leaf tasks done.
- **Ask.** The assistant now knows the app (a maintained skill, per role and language) and can propose task orders for a project; applying one is a reviewed change with Undo.

## Camino
- **Pirata work in Caminos.** Connect from Settings → Work connection with a token from Pirata. Assigned work appears under Tasks as Work tasks with a Pirata label, project, what to bring, and planned dates; it is never turned into goals, bookings or day plans. Complete a leaf task in Pirata from the task sheet; pending, confirmed, refused and uncertain states are shown honestly and retried safely. Detach a task to keep it as your own.
- **Goals are independent of tasks** and no longer need a date.
- **Start Day wake picker** aligned at every width.

## Rollout (phase 7)
- Pirata: migration 005 runs with the normal deploy recipe (additive only). The owner creates the token under Settings → Connections.
- Camino: production is schema 2. Rehearse on synthetic data, then: stop writers → `caminosctl migrate --db <abs> --to-schema 3` (preflight) → `caminosctl migrate --db <abs> --to-schema 3 --apply --backup <abs new file>` → start the build → connect from Settings. `CAMINOS_WORK_FEED_HOST` defaults to `pirata.andresinbox.tech`; `CAMINOS_ALLOW_HTTP=1` permits loopback http in development only.
