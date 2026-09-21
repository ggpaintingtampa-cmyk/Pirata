# Morgan el Pirata

Private painting-business workspace at **https://pirata.andresinbox.tech**.
Canonical source: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.

The current team version extends the existing application. Historical
`HOME-SCREEN-SPEC.md` and implementation packets describe earlier versions; the
September 18 team requirements supersede their home-screen/owner-only boundaries.

## September 19 Figma update

The revised [Figma designs](https://figma.com/design/uf6F2FArS37ia2QSMtSbNT)
are implemented in the existing app: charcoal surfaces, amber actions, daily
completion rings, clearer project cards, task sheets, updates filters and a
shared Files page. The floating **Add task** button opens quick task capture;
**Back to Add menu** reveals the other record types. All existing operations,
role permissions and private storage are retained.

See [Figma implementation and browser evidence](web/FIGMA-IMPLEMENTATION.md).

## September 18 design update

The black/grey/white workspace now has direct phone shortcuts for Projects,
Calendar and Tasks, a searchable grouped Menu, and a persistent desktop sidebar.
Pages retain their location on refresh and support browser Back/Forward. Project
section links jump directly to tasks, notes, files, activity and purchases.
Task search combines status, person and project filters. Title-only capture keeps
optional fields under More task details; all existing business operations remain.

See [redesign guide and screenshots](web/REDESIGN.md) and [visual QA](design-qa.md).

## Application

- **Work** opens with personal daily completion, independent current timer,
  practical checklists, projects, quick capture and cleanup reminders.
- **Ask** provides allowlisted business assistance, with owner-managed model,
  request and spending allowances. Live calls stay disabled until configured.
- **Updates** shows team activity, human messages and project files.
- **Menu** includes Projects, Calendar, team Progress, Today, Inventory, Clients,
  Shopping, tasks and role-appropriate settings. Spending/account/API controls
  belong to the owner.

A title alone saves an unfiled task. Add one level of subtasks, assign a responsible
person, paste several lines, save another, or reuse a list template. Up to three
explicit daily goals carry equal weight; a goal's subtasks divide its share
equally. Project completion uses top-level tasks without double counting.

Files attach directly to a task, project or client and appear through the hierarchy
without binary duplication. Photos (including converted HEIC) and PDFs are private
server files, with recoverable removal. Paint notes optionally keep product,
color/code, finish, quantity, store and a label attachment. Adding/checking shopping
items does not create spending or stock changes.

Equipment rules configure cleaning minutes and a maximum delay. Use creates one
open cleanup obligation with a fixed latest deadline. Snoozes are attributed and
cannot move that deadline; cleaning ends the cycle. Estimates never create time
entries.

## Structure and development

`web/`: React 19, TypeScript, Vite frontend. `server/`: authenticated Fastify API,
SQLite persistence, bounded file processing, business commands. `packages/domain/`:
original domain utilities and demo compatibility. `packages/contracts/`: shared
validated commands, DTOs and progress calculations. One pnpm workspace/lockfile.

Use the bundled Node 24 runtime:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
pnpm install --frozen-lockfile --prod=false
pnpm build
pnpm lint
pnpm test
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/integration/playwright.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/team/playwright.config.ts
```

The old browser-local demo stays isolated at `/?demo=1`; live data never falls back
to localStorage. No production business records are seeded or reset.

## Accounts

Sign in with username **andre** and the existing Pirata application password.
The owner's display name is **Andres**. The username changed from `owner` on
September 18 without changing account IDs, passwords or business records. If the
sign-in form or password manager still fills `owner`, replace it with `andre`.
The old browser Basic Auth prompt is replaced by application authentication after
the team deployment. In **Menu → Team accounts**, create an employee's name,
username and unique password of at least 15 characters. Share credentials privately.
There can be four enabled employees. The same screen resets passwords or disables
access; sessions are revoked and active employee work is saved/stopped on disable.
Owner recovery uses the existing concealed-input server CLI.

Everyone shares the existing business; accounts do not create new businesses.
Server checks protect finances, account administration, exports/imports and AI
settings. Business snapshots filter owner-only spending. Private files require
an active team session.

## Configure Ask securely

The app uses the official OpenAI Responses API with a configurable provider model;
it does not assume the coding model is the application model. Official reference:
https://developers.openai.com/api/docs/guides/function-calling

From a private administrator terminal, run:

```bash
sudo python3 '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/scripts/configure-ai-key.py'
```

The script reads the API key twice without echo, writes only
`/etc/pirata/openai.key` (0600, readable by `pirata`) and sets the service's
`PIRATA_OPENAI_API_KEY_FILE`. It deliberately permits outbound networking for
**only** `pirata-api.service` and restarts it. It changes no firewall or unrelated
service. The fixed provider endpoint is `https://api.openai.com/v1/responses`.
Never put the key in chat, source, frontend variables or command arguments.

Then open **Menu → Ask settings & usage**. Enter the chosen API model ID, current
input/output prices in US cents per million tokens, a daily request limit and
monthly budget in US cents. Enable requests only after all are configured.
Limits are team-wide in UTC; requests reserve a conservative maximum before calling
the provider. Uncertain/failed provider calls retain their reservation. Usage
shows token counts and calculated charges based on the configured rates; provider
billing is authoritative. Set provider-side project limits as an additional cap.

Ask can create a task immediately with Undo, search matching business records,
or prepare supported changes for review. It has no shell, SQL, hosting or arbitrary
file access. Uploaded images/PDFs are never automatically sent. Record names and
text are treated as untrusted data. The key is excluded from business exports and
uploaded-file backups; retain it in your own secret manager for disaster recovery.

## Deployment and recovery

Read [team deployment and recovery](web/deploy/TEAM-RECOVERY.md) before deploying or
restoring. It covers migration checksums, production-copy verification, coordinated
web/API/database cutover, uploaded-file backup manifests, scratch restore and
rollback limitations after new writes. Older applied migrations are immutable.
The latest verified live pair is recorded in
[deployed-release.json](web/deploy/deployed-release.json).

Screenshots and verification notes live in `web/artifacts/`.
Physical iPhone/Safari verification is reported separately from desktop Chromium
and Playwright WebKit; responsive emulation alone is not a device test.
