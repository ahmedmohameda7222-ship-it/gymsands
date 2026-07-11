# Plaivra release integrity

A public Plaivra release is identified by its reviewed commit, build timestamp, deployment environment, and schema compatibility version. A deployment is not launch-ready merely because a local build succeeds.

## Merge safety versus production release

Merging reviewed source into `main` does not authorize a production deployment.

Vercel evaluates `scripts/vercel-production-release-gate.mjs` through `vercel.json` before every build:

- preview and development deployments continue normally;
- production deployments are ignored unless `PLAIVRA_PRODUCTION_RELEASE_SHA` exactly equals Vercel's full 40-character `VERCEL_GIT_COMMIT_SHA`;
- missing, malformed, stale, or ambiguous production approval fails closed and skips the deployment.

Keep `PLAIVRA_PRODUCTION_RELEASE_SHA` empty during ordinary merges. Set it only in the Vercel **Production** environment after the exact reviewed commit has passed the database migration rehearsal, production migration decision, external configuration, real ChatGPT acceptance, populated reviewer-account QA, and legal release gates. Replace or clear it after each release so approval cannot silently carry to a later commit.

This hold makes the pull request merge-safe while the version-2 application remains release-blocked. It does not make the pending migrations or external launch checks optional.

## Required release gates

Every public release must have evidence for all of these gates from the same commit:

1. repository integrity check;
2. lint;
3. TypeScript typecheck;
4. unit tests;
5. integration tests;
6. production build;
7. successful deployment of the reviewed commit;
8. post-deploy smoke tests against the public deployment.

The pull-request quality workflow covers gates 1–6 and publishes logs plus a generated release manifest. Gates 7–8 require deployment-provider evidence and the post-deploy workflow. A build-rate-limit failure is still a failed deployment; do not describe it as resolved until a subsequent deployment and smoke run provide evidence.

## Build metadata

`GET /api/version` returns only:

- `commitSha`;
- `buildTimestamp`;
- `environment`;
- `schemaCompatibilityVersion`.

The endpoint is public so release automation can verify an artifact, but it rejects malformed metadata and never reads or reflects arbitrary environment variables. Vercel supplies the commit and environment automatically. CI and other providers should set:

```text
PLAIVRA_COMMIT_SHA=<full reviewed commit SHA>
PLAIVRA_BUILD_TIMESTAMP=<ISO-8601 timestamp captured before the build>
PLAIVRA_RELEASE_ENVIRONMENT=production
PLAIVRA_SCHEMA_COMPATIBILITY_VERSION=2
```

Increment the schema compatibility version only when application/database compatibility rules change, and document the supported cutover/rollback window with the additive migration.

Compatibility version `2` covers the pending 2026-07 pre-launch additive migration set. Apply and verify those migrations on an isolated database first, then apply them to production before promoting the version-2 application artifact. The prior version-1 application may be restored while the additive objects remain; do not remove or rewrite them as rollback. Once version-2 writers create data, disable the affected writer/feature flag and use an additive forward fix rather than reverting schema history.

## Release manifest

The immutable template is `release/release-manifest.template.json`. Generate evidence without editing the template:

```bash
npm run release:manifest -- \
  --commit "$REVIEWED_COMMIT" \
  --build-timestamp "$BUILD_TIMESTAMP" \
  --environment production \
  --schema-compatibility 2 \
  --quality-reports quality-reports \
  --output quality-reports/release-manifest.json
```

Missing reports remain `missing`; deployment and smoke stay `pending` until their external evidence exists. Never change a pending or failed gate to passed without retaining the corresponding log, deployment record, or smoke artifact.

## Deployment and smoke

After all release gates are complete, set `PLAIVRA_PRODUCTION_RELEASE_SHA` to the exact reviewed commit in the Vercel Production environment and trigger that exact commit's deployment. After the provider reports a successful deployment, run the **Post-deploy release smoke** workflow from the same commit. For production, use `https://app.plaivra.com`, the full expected commit SHA, and expected environment `production`. The workflow verifies the landing page, version endpoint, deployed commit, build timestamp, environment, and schema compatibility marker and uploads the resulting JSON evidence.

The same check can run locally against a preview:

```bash
npm run smoke:postdeploy -- \
  --url "https://preview.example" \
  --expected-commit "$REVIEWED_COMMIT" \
  --expected-environment preview \
  --output quality-reports/post-deploy-smoke.json
```

Do not run a production deployment, promote a preview, or apply production migrations automatically from this repository workflow. Preserve provider deployment evidence and obtain the required owner review before launch.

Operational cutover, monitoring, backup evidence, incident response, and submission assets are governed by:

- `docs/operations/launch-runbook.md`;
- `docs/operations/incident-response.md`;
- `docs/operations/submission-checklists.md`.
