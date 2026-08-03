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

## Provisional testing policy

- Run the smallest validation that protects the changed risk.
- Documentation-only changes do not require application builds, unit suites, browser QA, database replay, or integration tests.
- Do not run full regression by default.
- PCS-4 will replace this provisional test policy with the final CI operating model.
- Tests must protect behavior, security, data integrity, release identity, or a confirmed regression. Do not add tests solely to increase test count.

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
