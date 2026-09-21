# Pirata backend implementation packets

Prepared September 17, 2026. These are implementation instructions, not a claim
that a backend or public deployment exists. Read `STATUS.md` before starting.

## Recommended division

Build one application with one TypeScript API and one SQLite database. Five
feature tasks share the foundation; they must not create five login systems,
databases, deployments, or competing versions of the Today screen.

| Order | Task | Intended executor | Result |
|---|---|---|---|
| First | 00 Foundation | Stronger coding model | Auth, database, contracts, transactions, test harness |
| Parallel wave | 01 Clients and Projects | Codex Spark | Real clients, leads, follow-ups, jobs and job details |
| Parallel wave | 02 Tasks and Time | Codex Spark | Durable tasks, one timer, manual and corrected time |
| Parallel wave | 03 Schedule and Objectives | Codex Spark | Daily outcomes and explicit schedule editing |
| Parallel wave | 04 Spending | Codex Spark | Purchases, editing, date/project totals |
| Parallel wave | 05 Materials and Maintenance | Codex Spark | Stock, reservations, shortages, equipment upkeep |
| After feature wave | 06 Integration and security review | Stronger coding model | Connected UI, cross-device tests, import/export, recovery |
| Separate release lane | 07 Domain and deployment | Stronger model in Server Upkeep | DNS, authenticated HTTPS, releases and verification |

Task 07 can deploy the existing browser-local prototype before the backend is
ready. It must label that release accurately. Switching production to the new
backend requires Task 06's release gate and a second verification pass.

## Verified implementation status

Task00 foundation and Task01 clients/leads/projects are now **READY**. Read their
handoffs for implemented code and test evidence. The coordinator implemented
Task01 directly after the owner asked; do not restart its original feature AI.

The remaining Tasks02–05 still need implementation. Their earlier BLOCKED
handoffs accurately described a missing foundation at that time; that gate is
now resolved. Resume those existing tasks against `CONTRACT-FROZEN.md` and
`handoffs/00-foundation.md`, preserving their assigned paths and model settings.
Do not recreate the backend or write READY markers without working code/tests.

Task01 currently runs through the authenticated module harness. Task06 still
connects the modules to the normal Today application and navigation. Task07
handles the separately verified domain release; neither is complete yet.

The user has already launched the feature tasks. Preserve those tasks' model
settings when resuming them. Feature implementation stays in LargeConcierge;
Server Upkeep is for host deployment. Do not change global permissions or source
locations to compensate for a task being opened under a different sidebar project.

For current progress, read STATUS.md. Task07 deployment remains separate and
still requires the owner's access-policy choice before public exposure.

There is no Git repository at the source root as of preflight. Do not assume
worktrees or branches exist. The coordinator makes a source-only backup before
coding. Use disjoint owned paths in the existing tree. Only the coordinator
changes root configuration, lockfiles, central exports, migrations, shared
contracts, Today wiring, and global styling. If isolated Git worktrees are later
desired, establish and review the repository first; never commit private records.

## Product boundary

Owner-operated painting organizer: clients/jobs, daily work, labor time,
recorded spending, material availability, and maintenance. Existing Today
behavior stays usable. Add focused Projects, Clients, Inventory and Spending
views only where these tasks specify them. Schedule and Objectives remain on
Today and in its dialogs; More remains disabled until it contains real functions.

No invoicing, payment processing, profitability, payroll, multi-user crew,
calendar integrations, outbound messages, AI features, uploads, recurring
maintenance generation, or offline/PWA work in this wave.

The architecture in `SHARED-CONTRACT.md` is the starting decision. Task 00 must
implement, verify and freeze it before Spark begins. Any needed change is made
once by the coordinator and reflected in all affected prompts, not guessed by
each feature task.

## References

- [Shared requirements](SHARED-CONTRACT.md)
- [Foundation](00-foundation.md)
- [Clients and Projects](01-clients-projects.md)
- [Tasks and Time](02-tasks-time.md)
- [Schedule and Objectives](03-schedule-objectives.md)
- [Spending](04-spending.md)
- [Materials and Maintenance](05-materials-maintenance.md)
- [Integration](06-integration.md)
- [Domain deployment](07-domain-deployment.md)
- [Current status](STATUS.md)

Spark availability depends on account and client. The official model reference
lists `gpt-5.3-codex-spark`; use the actual model picker rather than claiming a
task runs on Spark merely because its title says so:
https://learn.chatgpt.com/docs/models
