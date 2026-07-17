# Migration reconciliation compatibility pointer

This file remains only because the current repository integrity workflow checks its presence. It is not current operational or product authority.

Current authority:

- `supabase/migration-ledger.json`
- `docs/architecture/migration-ledger-reconciliation.md`
- `docs/release/README.md`
- `docs/operations/launch-runbook.md`

Verified production state on 2026-07-17: 34 applied migrations, zero pending, zero schema-applied-untracked, zero unresolved, and reconciliation state `reconciled`. The latest identity is `20260716215602_muscle_intelligence_phase1_foundation`.

Never use this compatibility pointer to replay SQL, change production, merge, deploy, or override the current release gates. Historical reconciliation evidence is preserved in Git history and merged pull requests.
