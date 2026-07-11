# ADR 0002: Exercise catalog convergence

**Status:** Accepted for staged convergence  
**Date:** 2026-07-10

## Decision

`exercises` is the target global exercise-definition table because it carries source, licence, approval, slug, media, movement, and array-valued equipment metadata. `workouts` is the temporary launch compatibility source and must be treated as exercises despite its legacy name. `exercise_library` is frozen: no new writers or seeds.

Plan exercises remain immutable user-plan snapshots; user custom exercises remain user-owned records. Neither is replaced by the global catalog.

## Evidence

Production contains 600 rows in `workouts` and 600 rows in `exercise_library`. All 600 match across the two tables by trimmed, case-insensitive name. `exercises` contains zero rows. Runtime catalog reads use `workouts` and approved `exercises`; no active application read of `exercise_library` was found. Admin ingestion targets `exercises`.

## Staged data flow

1. Backfill each `workouts` definition once into `exercises` with explicit `source='plaivra_legacy_workouts'`, `source_id`, approval, provenance, and a deterministic slug.
2. Keep the existing dual-read only while parity is measured; deduplicate by stable source ID, then normalized name.
3. Change new imports and global-definition edits to `exercises` only.
4. Link new performed data and media by canonical exercise ID while retaining name snapshots.
5. Stop `workouts` reads after catalog totals, required metadata, search, plan builder, admin review, media, and RLS behavior match.

The dual-read must end no later than two verified releases after the backfill/canonical writer is enabled. `exercise_library` and `workouts` cannot be dropped until foreign keys, export paths, admin routes, and production references are zero and a backup has been verified.

## Security and licensing

Only approved global definitions are member-readable. Unapproved imports remain admin-only. Source and licence fields are preserved; missing provenance is marked for review rather than fabricated.

## Rollback

Disable canonical catalog reads and continue the immutable `workouts` compatibility source. Retain backfilled `exercises` rows for correction; do not remove either 600-row catalog automatically.
