# Plaivra Delivery Rules

## Mandatory delivery flow

Problem
→ Lead product decision
→ Approved UX and architecture specification
→ Implementation branch
→ Targeted validation
→ Lead QA/QC
→ Corrections if required
→ Explicit Ahmed approval
→ Squash merge
→ Production verification when applicable
→ Current-state update
→ Closed

## Implementation rules

- One approved scope per implementation PR.
- The implementer must not add related features without approval.
- The implementer must not redesign product behavior while solving a technical task.
- No Supabase Production writes, migration application, deployment, ready-for-review transition, or merge unless explicitly authorized.
- Immutable applied migrations are never edited.
- Long-term fixes are preferred over test-only bypasses or temporary workarounds.
- Do not read historical PRs or perform broad audits unless explicitly requested.
- Unknown facts must be reported, not invented.
- Keep PRs reviewable; do not accumulate unrelated corrections.

## Pull-request validation policy

- `.github/workflows/pr-quality.yml` is the automatic path-scoped Draft PR validation authority.
- `scripts/ci-change-scope.mjs` selects the affected core, database, rendered UI, CI-contract, build, and dependency lanes from the exact PR diff.
- Documentation-only changes remain lightweight.
- Test-only UI paths do not activate rendered browser QA merely because of their directory.
- Workout History, Active Workout, and Train implementation changes select their bounded rendered suites.
- Shared or unknown UI authority fails closed to all rendered suites.
- Empty diffs and unknown non-document paths remain fail-closed.
- Stable check names, exact-head identity, and focused failure artifacts must be preserved.
- A passing Draft PR Quality run is targeted validation only. Canonical phase-close Quality remains required for final phase closure after the exact stable Draft head is explicitly marked Ready for review.
- Exact Release, release preflight, deployment, and Production verification remain separate authorities.

The complete PCS-4A candidate model is recorded in `docs/ci/pcs4-ci-operating-model.md`. PCS-4A does not close PCS-4.

## Definition of Done

A scope is not complete until:

- approved requirements are implemented;
- no unapproved scope was added;
- relevant user states and failure states are handled;
- security and data-authority boundaries are preserved;
- targeted validation passes;
- documentation and current state are accurate;
- the implementation report states exact branch, head, files changed, validation performed, known limitations, and Production effects;
- Lead QA/QC approves it.
