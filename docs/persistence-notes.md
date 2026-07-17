# Persistence notes

## Account-backed today

The following are already persisted in Supabase and must not be described as browser-only:

- food favorites;
- saved recipes and saved recipe ingredients;
- meal-plan items and grocery items;
- nutrition targets, profiles, and explicit date overrides;
- app settings and AI permission settings;
- workout plans, schedule instances, performed sessions, and history;
- custom exercises, favorites, alternatives, and custom Muscle Intelligence mappings;
- progress, body measurements, photos, hydration, habits, tasks, sleep/recovery, supplements, and personal records.

These domains are covered by ownership, RLS, export, and deletion contracts appropriate to their model.

## Intentionally transient client state

Browser or in-memory state is appropriate for:

- unsaved form drafts;
- open/closed panels and dismissal state;
- active timer presentation helpers that can be reconstructed from persisted timestamps;
- optimistic UI state;
- short-lived search/filter state;
- local development or QA fixtures.

Do not create database tables for transient presentation state without a demonstrated cross-device, recovery, audit, or product requirement.

## Remaining persistence review

Before adding new account-backed storage:

1. identify the exact user value and cross-device requirement;
2. prove no existing canonical model fits;
3. define ownership, RLS, export, deletion, retention, offline/conflict, and migration behavior;
4. add a forward migration and tests;
5. remove obsolete local compatibility only after successful cutover.
