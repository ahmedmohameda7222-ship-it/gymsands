# Decisions, Risks and Boundaries

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Accepted decisions

- `main` is canonical; unmerged branches are overlays.
- Product authority order is fixed in `README.md`.
- ChatGPT is the reasoning layer; Plaivra is the durable control and execution layer.
- One canonical write model per domain.
- `workout_sessions` is the only performed-session root.
- AW-4 engine/store/clock/persistence boundaries are merged authority.
- Frozen prescription data is authoritative after session start.
- Direct and plan-day workout flows converge on canonical storage.
- `exercises` is the main-app exercise definition authority.
- Muscle mapping history is immutable and versioned.
- Activity Catalog is a separate project and must remain isolated.
- Applied migrations are immutable.
- Full canonical Quality runs at phase closure; Exact Release reuses its immutable artifact.
- Merge/deploy/compatibility promotion require explicit authorization.

## Current canonical risks / review signals

These are not automatic change requests:

1. Supabase Advisor flags authenticated execution of several `SECURITY DEFINER` RPCs. Review actor checks, grants and intent before classifying.
2. Advisor reports RLS-with-no-policy on service-only/deny-all candidates. Confirm the access model; do not add client policies by reflex.
3. Leaked-password protection was reported disabled.
4. Bounded compatibility writers remain in the workout-plan model until full cutover.
5. Generated Graphify context can become stale; it is an aid, never authority.
6. Documentation snapshots can drift; `context_manifest.json` and the refresh protocol are mandatory.

## Active PR #90 blockers

The Planner's independent branch audit recorded confirmed AW-5 correction work. The authoritative snapshot for this branch is `active-work/pr-90-aw5-overlay.md`.

Do not copy these issues into canonical architecture after merge unless they remain true.

## Hard no-go without explicit authorization

- merge or deploy;
- Production or Activity Catalog writes;
- compatibility-marker promotion;
- migration history repair;
- editing an applied migration;
- force-push or branch replacement;
- starting a later AW phase;
- new durable session roots, timer tables or duplicate writers;
- exposing admin or unrestricted context through public MCP;
- changing security grants/RLS based only on an advisor warning;
- committing generated screenshots, logs or run artifacts;
- broad cleanup without dependency and deletion proof.

## Context-base boundary

This directory should remain:

- small enough to read selectively;
- factual and path-based;
- free of copied source bodies;
- free of historical implementation reports;
- explicit about canonical versus unmerged state;
- refreshed incrementally after meaningful changes.

It must not grow into a second product constitution or a stale prose clone of the repository.
