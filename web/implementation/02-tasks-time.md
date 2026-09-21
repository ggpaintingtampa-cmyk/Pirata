# Task 02 — Tasks and Time (Codex Spark)

Implement durable task and labor-time operations with no timer regressions.

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

- server/src/modules/tasks-time/**
- server/tests/modules/tasks-time/**
- web/src/features/tasks-time/**
- web/tests/modules/tasks-time/**
- web/implementation/handoffs/02-tasks-time.md

## Operations

task.create (optional schedule committed atomically through shared helper),
task.update, task.setStatus, timer.start, timer.pause, timer.switch,
timer.correctStart, timer.discard, timeEntry.createManual, timeEntry.correct.
Use frozen command schemas; do not accept an arbitrary whole AppState replacement.

Tasks: title 1–160 trimmed, existing project or null General business, estimate
integer 1–1440 minutes, status open/blocked/done, note max 1000. Preserve creation
order and timestamps on edits. Estimate edits do not change planned blocks.

## Timer invariants

Exactly one active session per owner across devices. Start server-stamps time;
starting the same running task is a no-op. Blocked/done requires explicit reopen.
Switch requires confirmation of the currently observed session ID and atomically
closes that session and creates the next. Pause, finish, block, correction and
discard use expected session ID plus revision, so a stale phone cannot stop a
newer timer. Repeated Pause cannot create a duplicate interval.

Closed entry ID equals its running session ID. Zero length creates no entry.
Negative intervals are rejected with a correction path, never clamped into a
fabricated saved duration. Finish/block closes only the affected task's running
session in the same transaction. Reopen retains history. Keep real cross-midnight
start/end intervals. One-second display updates never save to the API.

Manual entries: work date, existing task, 1–1440 whole minutes, optional note.
Corrections preserve ID, task and source and are explicit. Use milliseconds for
summing first and round only display. Unfinished tasks never call unused estimate
time saved. Include running elapsed in actual total, not twice after pause.

## UI

Provide the frozen task list/detail/editor and timer-control entrypoints for
Today/project integration. Use the common dialog system. Explain that active
sessions continue while the page is closed. Use serverNow offset for display;
server time is authoritative for commands, not the phone's wall clock. Handle
clock inconsistencies visibly. Confirm switch/discard without nested modals.

## Required tests

Start/pause/resume durations; duplicate start/pause/retry; switch only one active
session; finish/block closes session; reopen history; zero/negative duration;
cross-midnight interval; refresh/restart reconstruction; manual correction;
server outage keeps draft and active saved state; rollback scheduled-task creation.
Two independently authenticated browser contexts racing start/switch/pause cannot
create overlapping active sessions or silently lose updates. Failed revision
conflicts explain refresh/review; never auto-replay a different user intent.

Deliver module tests, focused phone dialog/timer tests, lint/typecheck, and a
handoff describing adapters needed for existing CurrentTaskCard and TaskDialog.
Do not modify those shared existing components during the parallel wave.
