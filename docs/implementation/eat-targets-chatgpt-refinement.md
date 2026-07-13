# Eat Targets and ChatGPT Refinement

This branch implements the approved follow-up refinement for the merged Eat redesign.

## Scope

- Replaces the Nutrition Targets estimator and duplicated cards with one date-backed assignment draft and one editor.
- Persists explicit per-date target assignments through a pending Supabase migration and atomic Apply RPC.
- Migrates legacy localStorage assignments only when no server assignment exists.
- Guards unapplied changes for controlled navigation, history navigation, refresh, and close.
- Uses the canonical OpenAI Blossom in Eat and planned-meal actions.
- Adds route-aware Eat and planned-meal homes to the existing shared ChatGPT drawer.
- Adds professional meal-adjustment prompt contracts with cautious dairy/gluten relevance detection.
- Uses one Week navigation system, compact tracking coverage, a logged-day macro title, and accessible hidden Repeat scrollbars.

## Production safety

- The migration is recorded as pending.
- No production migration or data change is performed by this branch.
- The pull request must remain unmerged until owner approval.
