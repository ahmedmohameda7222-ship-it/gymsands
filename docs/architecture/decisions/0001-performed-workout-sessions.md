# ADR 0001: Performed workout sessions

**Status:** Accepted for staged convergence  
**Date:** 2026-07-10

## Decision

`workout_sessions` is the canonical performed-session header and `exercise_logs` is the canonical performed-set store. `user_workout_sessions` remains the schedule-instance model until every scheduled execution is linked to a performed session. `user_exercise_logs` is a compatibility exercise-completion snapshot, not a second set store.

No third session model will be introduced. A scheduled row may exist without a performed row. A performed row may exist without a schedule when the user starts a direct workout.

## Evidence

The 2026-07-10 read-only production capture found:

| Model | Rows | Role proven by schema/runtime |
| --- | ---: | --- |
| `user_workout_sessions` | 24 | scheduled plan instances, including future `scheduled` state |
| `workout_sessions` | 7 | actually started/completed/skipped sessions and direct execution |
| `user_exercise_logs` | 0 | one completion snapshot per scheduled exercise |
| `exercise_logs` | 45 | set-numbered performed data used by history and progress |

All three users represented in either header table had different per-user totals between the two tables. Two of three users had different exercise-log totals. Therefore a row-for-row replacement or deletion would be incorrect.

Active direct UI and MCP execution write `workout_sessions`/`exercise_logs`; scheduled-plan loading also reads `user_workout_sessions`/`user_exercise_logs`. Export currently includes both generations.

## Data flow and ownership

1. Plan generation creates user-owned plan days and schedule instances.
2. Starting a scheduled instance creates or links one owned `workout_sessions` row.
3. Set completion writes only `exercise_logs`, with plan-exercise snapshots retained.
4. Scheduled status is derived from or synchronized with the linked performed session during the bounded compatibility period.
5. Direct workouts create a performed session without a schedule link.

RLS ownership flows from `workout_sessions.user_id`; performed sets inherit ownership through their parent. Public MCP tools must call the workout domain service.

## Staged cutover

An additive migration must add a nullable unique schedule link and source metadata to performed sessions/logs. Backfill only non-`scheduled` schedule instances, preserving IDs through explicit source columns. Verification must compare total and per-user counts, statuses, timestamps, plan links, and performed values.

Dual-read is limited to two verified releases after all writers use the canonical performed model. Removing compatibility reads requires zero runtime references, export/deletion coverage, RLS tests, backup evidence, and owner review. Dropping either compatibility table is a separate destructive migration and is not authorized by this ADR.

## Rollback

Before read cutover, disable the canonical-write feature flag and continue the existing writers. Additive columns and backfilled rows remain. After cutover, forward-fix data/link errors; do not delete performed history to roll back.
