# P10A-A3 — Main dormant Activity Catalog V2 contract

This bounded Main Plaivra change proves that Main can parse and freeze the immutable identities exposed by the Activity Catalog V2 contract without changing any current provider/runtime behavior.

Starting Main authority: `6ec12497612446a9a9dd6cc1d91709cc8f045b22`.

## Dormant contract only

`lib/activity-catalog/v2-contract.ts` contains V2-only types, strict runtime parsing helpers, the dormant Main capability representation, and a pure snapshot-authority projection. It is not imported by the current Activity Catalog client, server selector, HTTP provider, legacy provider, Active Workout, History, Heat Map runtime, or Personal Records runtime.

The existing provider selector remains unchanged: absent/`legacy` mode selects the legacy provider exactly as before. No environment assignment or provider cutover is introduced.

## Frozen semantic identities

The dormant snapshot representation can preserve, for a future provider/session snapshot phase:

- catalog release ID and checksum;
- stable Activity Catalog activity ID;
- immutable activity revision ID and number;
- prescription schema key/version;
- performed metric schema key/version;
- Record Definition version IDs;
- mapping profile ID;
- detailed taxonomy key/version;
- workload model key/version;
- publication policy version;
- Main capability contract version.

No current workout snapshot schema or persisted user data is changed in this phase.

## Capability contract

The dormant capability manifest is `main-activity-catalog-v2-capability-v1` and is anchored to the approved Main SHA. It declares only the workload model already implemented by Main Muscle Intelligence: Catalog `resistance_sets/v1` maps to Main runtime identity `resistance_sets_v1` and calculation engine `muscle_load_resistance_sets_v2`.

No Personal Record formula capability is claimed because this batch did not prove a controlled Main formula key/version contract. The list intentionally remains empty rather than inventing support.

## Frozen fixture and tests

`services/activity-catalog/v2/fixtures/catalog-v2-activity.fixture.json` is a deterministic contract fixture for the private Catalog V2 representation. Tests prove strict parsing, rejection of malformed semantic identities, complete snapshot representability, exact capability identity, and the absence of runtime wiring/provider-mode changes.

This PR contains no Main database migration, Production change, provider activation, fallback change, exercise/muscle mapping change, Heat Map executable change, or Personal Records behavior change.
