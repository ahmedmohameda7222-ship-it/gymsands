# P10 Batch 2 — dormant Main multi-sport capabilities

This branch is intentionally dormant. It does not activate the Activity Catalog provider, change the legacy provider selector, alter the current Heat Map or Personal Records runtime, add a Main database migration, or change user-facing workout/session behavior.

## Engine authority

The immutable engine-authority commit is `0a4c902a560542812de72cbc08dc90fe3fb7d147`. The later `main-activity-catalog-v2-capability-v2` manifest references that ancestor rather than attempting to self-reference the final PR head.

## Duration exposure v1

`duration_exposure/v1` maps to Main runtime identity `duration_exposure_v1` and pure engine `muscle_exposure_duration_v1`.

For canonical `duration_seconds`, each reviewed anatomical mapping entry receives `exposure_seconds = duration_seconds × mapping_contribution`. The engine preserves muscle, role, and side semantics. It rejects negative/non-finite duration and invalid mapping contributions. Zero duration yields zero exposure.

The model is anatomical time exposure only. It does not represent physiological training load, calorie burn, cardiovascular intensity, recovery demand, or cross-sport equivalence. It intentionally has no HR, RPE, or intensity multiplier.

## Dormant PR capability

The manifest exposes the four already-implemented `wh6-v1` strength formula families plus `longest_duration/v1` and `longest_distance/v1`. The new scalar evaluators require finite values greater than zero and a comparison helper enforces immutable activity identity plus compatible comparison context.

No new formula is wired into the current legacy Personal Records candidate/UI path.
