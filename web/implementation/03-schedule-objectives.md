# Task 03 — Schedule and Daily Objectives (Codex Spark)

Implement the daily planning module; keep it on Today and its dialogs.

## Start gate and shared rules

Use the LargeConcierge project. Root:
`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.
Read `/home/andre/Desktop/LargeConcierge/AGENTS.md`, project README,
`web/README.md`, `web/implementation/SHARED-CONTRACT.md`,
`web/implementation/CONTRACT-FROZEN.md`, and foundation handoff
`web/implementation/handoffs/00-foundation.md`.
If frozen contracts or a READY foundation are missing, report that dependency;
do not scaffold an alternative backend or invent interfaces.

Implement only your owned paths below. Use the frozen handler/service interfaces,
shared transaction/validation/auth/revision/idempotency helpers and UI harness.
Do not modify lockfiles, migrations, auth, global CSS, App.tsx, Today wiring,
central registration or other agents' files. Put needed shared changes in your
handoff for the coordinator. No deployment or system changes. No new dependencies
unless the coordinator incorporates them. Do not send client messages or emails.

Every write is authenticated, owner-scoped, validated server-side and atomic.
Use stable request IDs. Server controls timestamps for ordinary actions. On
failure keep drafts and old saved state. Reuse existing cents/date/material/time
semantics. Use real SQLite/injection tests plus focused browser tests, with
isolated fixtures. Do not test mutations against live business data.

## Owned paths

- server/src/modules/planning/**
- server/tests/modules/planning/**
- web/src/features/planning/**
- web/tests/modules/planning/**
- web/implementation/handoffs/03-schedule-objectives.md

## Objectives

Implement objectives.replaceForDate using the shared revision and atomic
transaction. Maximum three per date INCLUDING done. Title 1–160 trimmed,
optional owned task, status open/partial/blocked/done, note <=1000, unique rank.
Blocked requires explanation. Reorder/add/remove updates only that date.
Completion is independent of linked task status and derived count is never saved.
Empty state: Choose up to three outcomes for today.

## Schedule

Implement schedule.setTaskBlock and schedule.removeTaskBlock. Exactly one
planned block per task. Explicit validated date and local minutes: start 0–1439,
end 1–1440, end > start, no overnight inference. Date input errors stay by fields.
Task title changes are reflected consistently through the frozen read mapping.
Changing estimate or completing task must preserve the planned block.

Retain existing sample non-task commitments as informational. Do not create a
calendar integration or expand commitment editing in this wave. Existing kinds:
task, appointment, travel, supply_run, break, cleanup.

Sort by start time then stable ID. An overlap occurs when a.start < b.end and
b.start < a.end on the same date; touching endpoints do not overlap. Ignore the
same block during edit. Warn and require an explicit save-with-conflict choice,
but allow the user to keep the conflict. Never move other blocks automatically.
Re-evaluate against the latest accepted revision before committing.

## UI and cross-module boundary

Provide objective editor and scheduling dialog entrypoints. Preserve native
dialog focus restoration, dirty-input confirmation, ranks/Up/Down actions and
320px usability. Select existing tasks via shared snapshot. No separate full
calendar page. Today date uses America/New_York and updates on focus/midnight.
Old dates remain unchanged. New task plus initial block is owned by Tasks/Time
and must use the foundation's shared atomic schedule helper; don't add a second
HTTP request for that transaction.

## Required tests

Fourth objective rejected even when another is done; blocked needs note;
reordering and changing today leaves other dates intact; objective/task completion
independent. Impossible date, zero/negative length and overnight blocks rejected.
Adjacent blocks permitted, actual overlaps flagged, edit excludes itself. Reschedule
updates same task block without duplicates. Completing task and editing estimate
preserve timing. Retry once, cross-owner rejection, stale revision and rollback.

Browser: status/save/refresh, date edit and conflict warning; explicitly keep
conflict and prove other blocks did not move; dirty Cancel leaves saved state.
Deliver results and frozen UI export names in your handoff.
