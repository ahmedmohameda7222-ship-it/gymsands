# ADR 0005: Muscle intelligence taxonomy and mapping authority

- Status: Accepted for Phase 1 foundation
- Date: 2026-07-16

## Decision

Plaivra uses one code-authoritative 24-muscle taxonomy, versioned as `muscle_taxonomy_v1`. The immutable TypeScript registry owns canonical IDs, display order, translations, body regions, supported views, and logical navigation groups. PostgreSQL stores checked canonical ID strings; it does not duplicate the taxonomy in a mutable table.

`exercises.id` remains the canonical global exercise identity. `exercise_provider_links` stores reviewed aliases for external/provider or legacy identities, but provider IDs, slugs, names, translations, and free-text muscle fields are never authoritative. There is no name-only mapping.

Global mappings belong to canonical `exercises` rows. Custom mappings belong to one `user_custom_exercises` row and its owner, enforced by a composite foreign key and RLS. Published versions are immutable, have deterministic semantic SHA-256 checksums, and are replaced only through atomic publish-and-retire functions.

The shared deterministic calculation engine may support a client preview in a later phase. Future persisted or trusted analysis must be produced by a server-authoritative execution path with explicit taxonomy, mapping, engine, threshold, and result-schema versions.

## Boundaries

- Historical mapping snapshots are deferred to Phase 3.
- Phase 1 does not seed trusted mappings or infer them from current free-text fields.
- Phase 1 does not change Train plans, sessions, logging, UI, or runtime behavior.
- Provider data may be reviewed as research input but cannot publish authoritative mappings automatically.
- Muscle exposure levels are descriptive categories, not medical interpretation, diagnosis, injury risk, or prescription.

## Consequences

Result-changing taxonomy, mapping, calculation, threshold, or output changes require an appropriate new version. Translation-only corrections do not automatically change calculation versions. The database constraints and publication functions defend mapping integrity independently of any future UI.
