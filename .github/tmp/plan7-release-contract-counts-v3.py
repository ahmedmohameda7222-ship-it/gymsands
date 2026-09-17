from pathlib import Path

MIG = "20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql"


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} occurrences, found {actual}: {old!r}")
    p.write_text(text.replace(old, new, count))


p = "scripts/promote-release-schema-compatibility.test.mjs"
replace(p, 'assert.equal(state.pendingCount, 2);', 'assert.equal(state.pendingCount, 3);')
replace(p, 'assert.equal(state.unresolvedCount, 2);', 'assert.equal(state.unresolvedCount, 3);')
replace(
    p,
    '  }, {\n    localFile: "20260915170012_food_catalog_owner_correction_export.sql",\n    productionVersion: undefined,\n    productionName: undefined,\n  }]);',
    '  }, {\n    localFile: "20260915170012_food_catalog_owner_correction_export.sql",\n    productionVersion: undefined,\n    productionName: undefined,\n  }, {\n    localFile: "' + MIG + '",\n    productionVersion: undefined,\n    productionName: undefined,\n  }]);',
)

p = "scripts/release-compatibility-contract.test.mjs"
replace(
    p,
    'const PLAN7_OWNER_EXPORT_MIGRATION = "20260915170012_food_catalog_owner_correction_export.sql";',
    'const PLAN7_OWNER_EXPORT_MIGRATION = "20260915170012_food_catalog_owner_correction_export.sql";\nconst PLAN7_RESTORE_REACTIVATION_MIGRATION = "' + MIG + '";',
)
replace(
    p,
    '[PLAN7_PENDING_MIGRATION, PLAN7_OWNER_EXPORT_MIGRATION]',
    '[PLAN7_PENDING_MIGRATION, PLAN7_OWNER_EXPORT_MIGRATION, PLAN7_RESTORE_REACTIVATION_MIGRATION]',
)
replace(p, 'assert.equal(ledger.pendingCount, 2);', 'assert.equal(ledger.pendingCount, 3);')
replace(p, 'assert.equal(resolved.pendingMigrationCount, 2);', 'assert.equal(resolved.pendingMigrationCount, 3);')
replace(p, 'assert.equal(resolved.unresolvedMigrationCount, 2);', 'assert.equal(resolved.unresolvedMigrationCount, 3);')
replace(p, 'assert.equal(releaseMetadata.pendingMigrationCount, "2");', 'assert.equal(releaseMetadata.pendingMigrationCount, "3");')
replace(p, 'assert.equal(releaseMetadata.unresolvedMigrationCount, "2");', 'assert.equal(releaseMetadata.unresolvedMigrationCount, "3");')

p = "scripts/release-target-compatibility.test.mjs"
replace(
    p,
    'const PLAN7_OWNER_EXPORT_MIGRATION = "20260915170012_food_catalog_owner_correction_export.sql";',
    'const PLAN7_OWNER_EXPORT_MIGRATION = "20260915170012_food_catalog_owner_correction_export.sql";\nconst PLAN7_RESTORE_REACTIVATION_MIGRATION = "' + MIG + '";',
)
replace(
    p,
    '[PLAN7_PENDING_MIGRATION, PLAN7_OWNER_EXPORT_MIGRATION]',
    '[PLAN7_PENDING_MIGRATION, PLAN7_OWNER_EXPORT_MIGRATION, PLAN7_RESTORE_REACTIVATION_MIGRATION]',
)
for old, new in [
    ('assert.equal(ledger.pendingCount, 2);', 'assert.equal(ledger.pendingCount, 3);'),
    ('assert.equal(releaseTarget.pendingCount, 2);', 'assert.equal(releaseTarget.pendingCount, 3);'),
    ('assert.equal(releaseTarget.unresolvedCount, 2);', 'assert.equal(releaseTarget.unresolvedCount, 3);'),
    ('assert.equal(qualityTarget.pendingCount, 2);', 'assert.equal(qualityTarget.pendingCount, 3);'),
    ('assert.equal(qualityTarget.unresolvedCount, 2);', 'assert.equal(qualityTarget.unresolvedCount, 3);'),
    ('assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "2");', 'assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "3");'),
    ('assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "2");', 'assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "3");'),
]:
    replace(p, old, new)
