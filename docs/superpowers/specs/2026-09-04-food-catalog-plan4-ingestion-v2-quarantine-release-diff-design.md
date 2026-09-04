# Food Catalog Plan 4 — Ingestion V2, Quarantine, and Release-Diff Design

**Status:** Plan 4 implementation authority under the owner-approved master execution authority  
**Date:** 2026-09-04  
**Parent architecture:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`  
**Frozen base:** `main@7dde8c1166d255da493f6a5f0440c9078e5abd9a`  
**Scope:** Plan 4 only; provider-neutral engine plus synthetic/reference adapter for tests. No real provider ingestion.

## Purpose

Plan 4 converts Batch 0 ingestion readiness into a durable provider-neutral ingestion control path. Existing Batch 0 structures are migration input: retain sound semantics and extend them additively where Plan 4 requires stronger authority.

```text
synthetic fixture -> adapter -> normalized candidates -> validation
-> deterministic canonical decision + processing disposition
-> deterministic ManifestContent -> dry run
-> privileged draft-only execution -> reconciliation
-> immutable operational/release-diff evidence
```

No stage activates or verifies a Food, promotes or changes a Catalog Generation, or exposes draft Foods to members.

## Governing invariants

- Plaivra-owned Food ID is canonical identity.
- Provider IDs, names, GTINs, taxonomy, market evidence and nutrient IDs are evidence only.
- Unknown nutrition is `NULL`; source zero is `0`; no imputation.
- No generic household conversions or generic `ml <-> g` conversions.
- Name/nutrition similarity alone never auto-merges canonical identity.
- My Foods and historical Nutrition snapshots are outside Plan 4 mutation authority.
- Ingestion, activation, verification and generation promotion remain separate authorities.
- Catalog Generation remains sole current-effective Food Catalog authority.
- Production execution is draft-only and uses narrow trusted commands.
- Provider-specific semantics must not leak into provider-neutral engine contracts.

## Provider adapter contract

Adapters are pure transformations of an exact provider artifact into deterministic structured evidence. They receive no Supabase client and own no activation/promotion capability.

```ts
export interface FoodCatalogSourceAdapter<TArtifact> {
  readonly adapterId: string;
  readonly adapterVersion: string;
  describeSource(artifact: TArtifact): FoodCatalogSourceDescriptor;
  toCandidates(artifact: TArtifact): readonly FoodCatalogCandidateInput[];
}
```

Plan 4 includes only a synthetic/reference adapter for tests and architecture verification. USDA/FDC/FNDDS parsing is explicitly deferred.

## Structured candidate evidence

A normalized candidate supports exact versioned source identity/checksum plus structured evidence for:

- canonical/display and localized/source names;
- aliases/transliteration roles without pretending they are source translations;
- identity qualifiers such as state/preparation/form and deterministic semantic signature;
- nullable source-backed nutrition and source nutrient payload;
- exact source-backed serving facts;
- GTINs;
- Plaivra taxonomy mapping evidence;
- explicit Plaivra market-scope evidence;
- raw source nutrition/serving evidence for provenance.

The engine never invents absent facts.

## Canonical outcome vs processing disposition

The canonical ingestion decision remains exactly the approved conceptual set:

`MATCH | CREATE | POSSIBLE_DUPLICATE | REJECT`

Quarantine is **not** a fifth canonical outcome. It is an orthogonal processing disposition/audit state:

`ACCEPT | QUARANTINE | REJECT`

Rules:

- structurally invalid evidence produces canonical `REJECT` + disposition `REJECT`;
- `POSSIBLE_DUPLICATE` is quarantined;
- a provisional `MATCH` or `CREATE` may also be quarantined when otherwise-valid evidence has a barcode conflict, suspicious release change or other unresolved inconsistency;
- only `ACCEPT` candidates may proceed to canonical draft mutation;
- quarantine resolution is immutable audit evidence and does not rewrite the original source snapshot or original decision evidence.

Quarantine reason classes include at least `possible_duplicate`, `identity_conflict`, `barcode_conflict`, `nutrition_anomaly`, `serving_conflict`, `source_release_break`, `mapping_ambiguity`, `evidence_inconsistency`, and `suspicious_material_change`.

## Matching order

Matching is deterministic and respects stable identity:

1. exact versioned provider/source identity;
2. exact GTIN ownership where applicable;
3. approved canonical redirect;
4. strong structured canonical identity;
5. high-confidence state/preparation/alias evidence;
6. `POSSIBLE_DUPLICATE`;
7. new distinct Food (`CREATE`).

No branch may turn name or nutrition similarity alone into `MATCH`.

## Semantic batch identity

`food_ingestion_batches` remains the semantic batch root but gains a complete semantic identity checksum binding:

- provider and dataset;
- source release/version/date;
- source licence/reference;
- source artifact SHA-256;
- importer/adapter version;
- deterministic transformation/config SHA-256;
- deterministic ManifestContent SHA-256;
- exact expected semantic counts, including quarantine count;
- the canonical semantic-identity payload checksum.

Equivalent semantic input maps to the same semantic batch authority. A changed source/config/release/manifest/expected mutation set is a changed semantic batch. Execution retries create new run attempts, not new semantic batches.

## Deterministic ManifestContent

`ManifestContent` is semantic authority; `ManifestEnvelope` is volatile operational metadata.

Only deterministic content is hashed. Timestamps, run IDs, diagnostics paths and other volatile metadata stay outside the hash.

Canonicalization deterministically normalizes, sorts and deduplicates all unordered semantic collections: candidate ordering, source identities, names/aliases, servings, GTINs, market scopes, taxonomy evidence, validation issues, possible-duplicate IDs, disposition/quarantine evidence and expected mutations. Object keys are recursively sorted. Equivalent semantic input therefore produces byte-equivalent canonical JSON and the same SHA-256.

## Execution lease

Production execution is database-authoritative, not protected by an in-process mutex.

Each Production attempt supports lease owner, unguessable token, monotonic epoch, acquired time, heartbeat time and expiry. A live lease cannot be stolen. An expired lease may be deterministically taken over by a trusted command. Every draft mutation validates run state, exact approved manifest checksum and current unexpired lease token/epoch.

This establishes one logical Production writer for the same semantic authority scope plus stale-run recovery and race-safe retry semantics.

## Draft-only trusted persistence

Plan 4 persistence commands are narrow. They may:

- create/get semantic batch authority and run attempts;
- acquire/heartbeat/take over lease;
- persist exact source snapshots and batch participation;
- attach an accepted exact canonical match;
- create an accepted new canonical root only as `draft`;
- append source-backed Plan 1 nutrition/name/serving/taxonomy/market facts;
- persist quarantine evidence/resolution;
- persist/finalize reconciliation;
- append immutable operational events and release-diff evidence.

They must not mutate activation authority, verification approval authority, generation composition/current pointer, member visibility, My Foods or historical snapshots. Application code must not expose a generic canonical table editor.

## Reconciliation

Every semantically completed run has one immutable reconciliation result comparing reviewed deterministic expectation with observed effects. Fail-closed mismatch classes include:

- `missing_expected_write`;
- `unexpected_extra_write`;
- `duplicate_semantic_result`;
- `manifest_checksum_mismatch`;
- `idempotency_mismatch`;
- `partial_execution`;
- `quarantine_divergence`;
- `outcome_count_mismatch`.

A mismatched run cannot be marked semantically completed.

## Release diff

Release diff is deterministic evidence, never current-catalog mutation. Supported record classifications include at least:

`unchanged`, `source_record_added`, `source_record_removed`, `nutrition_changed`, `serving_changed`, `naming_changed`, `barcode_changed`, `taxonomy_changed`, `market_evidence_changed`, `canonical_match_changed`, `newly_quarantined`, `quarantine_resolved`, `suspicious_material_change`.

A release-diff checksum binds compared semantic batch identities, classifications and summary counts.

## Operational events

Persist immutable structured events for batch creation; dry-run start/completion/failure; Production start/heartbeat/completion/failure; lease acquired/lost/taken over; candidate quarantined; quarantine resolved; reconciliation mismatch; and release diff produced. Full capability/observability governance is deferred to Plan 6.

## Database strategy

One forward migration:

`supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql`

It may alter Batch 0 ingestion structures and add Plan 4 authority tables/functions. No applied migration bytes may change.

New Plan 4 authority relations are RLS-enabled, unavailable to `anon`/`authenticated`, and directly read-only to `service_role` where RPC mutation authority is required. Security-definer command functions pin `search_path`, validate exact semantic/run/lease authority and are executable only by `service_role`.

Batch 0's pre-existing broad service-role grants remain migration input; Plan 4 does not expand them and Plan 4 application code is constrained to narrow commands. Full generic-privilege replacement belongs to Plan 6.

## Non-goals

No real provider adapter/download, USDA/FDC/FNDDS/Open Food Facts assumptions, Production Food population, activation, verification, generation promotion, member search cutover, deployment, Nutrition redesign, My Foods merge, historical rewrite, Activity Catalog mutation, paid infrastructure, or market inference from locale/IP/timezone/location.

## Acceptance

Plan 4 requires executable evidence for deterministic adapter replay and manifest hashing; changed semantic identity; stable matching; canonical decision/disposition separation; immutable quarantine history; lease expiry/takeover/concurrency; exact-manifest draft-only execution; idempotent replay; fail-closed reconciliation; deterministic release diff/events; >1,000-candidate replay; privileged access boundaries; and absence of real-provider/activation/promotion/Production-Food scope.

Canonical exact-head PR Quality and phase-close Quality remain required before the technical gate.