#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const UUID_RE = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const UUID_LIKE_RE = "^[0-9a-fA-F-]{20,}$";

export function buildOwnerReconciliationSql({ diagnostic = false } = {}) {
  const diagnosticProjection = diagnostic
    ? `, 'diagnosticRows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rowId', classified.row_id,
            'disposition', classified.disposition,
            'reason', classified.reason
          )
          order by classified.row_id
        )
        from classified
      ), '[]'::jsonb)`
    : "";

  return `
begin read only;
with favorite_rows as materialized (
  select
    favorite.user_id,
    favorite.food_key,
    encode(
      extensions.digest(
        pg_catalog.convert_to(favorite.user_id::text || '|' || favorite.food_key, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) as row_id,
    favorite.food_key ~ '${UUID_RE}' as is_uuid,
    favorite.food_key ~ '${UUID_LIKE_RE}' as is_uuid_like,
    (
      position('|' in favorite.food_key) > 1
      and length(btrim(split_part(favorite.food_key, '|', 1))) > 0
      and length(btrim(substring(favorite.food_key from position('|' in favorite.food_key) + 1))) > 0
    ) as is_legacy_text
  from public.user_food_favorites favorite
),
resolution as materialized (
  select
    row.*,
    (select count(*) from public.food_items food where lower(food.id::text) = lower(row.food_key)) as catalog_matches,
    (select count(*) from public.user_food_items food where lower(food.id::text) = lower(row.food_key)) as my_food_matches,
    (select count(*) from public.user_food_items food
      where lower(food.id::text) = lower(row.food_key)
        and food.user_id = row.user_id
        and food.deleted_at is null) as same_owner_active_my_food_matches,
    (select count(*) from public.user_food_items food
      where lower(food.id::text) = lower(row.food_key)
        and food.user_id = row.user_id
        and food.deleted_at is not null) as same_owner_deleted_my_food_matches,
    (select count(*) from public.user_food_items food
      where lower(food.id::text) = lower(row.food_key)
        and food.user_id <> row.user_id) as cross_owner_my_food_matches,
    exists (
      select 1
      from public.food_favorites favorite
      join public.food_items food on food.id = favorite.food_id
      where favorite.user_id = row.user_id
        and lower(food.id::text) = lower(row.food_key)
    ) as catalog_favorite_exists
  from favorite_rows row
),
classified as materialized (
  select
    resolution.*,
    case
      when not is_uuid and is_legacy_text and not is_uuid_like then 'legacy_text_preserved'
      when not is_uuid then 'blocked'
      when catalog_matches = 1 and my_food_matches = 0 and catalog_favorite_exists then 'catalog_already_mapped'
      when catalog_matches = 1 and my_food_matches = 0 then 'catalog_mappable'
      when catalog_matches = 0 and my_food_matches = 1
        and same_owner_active_my_food_matches = 1
        and same_owner_deleted_my_food_matches = 0
        and cross_owner_my_food_matches = 0 then 'my_food_preserved'
      else 'blocked'
    end as disposition,
    case
      when not is_uuid and is_legacy_text and not is_uuid_like then null
      when not is_uuid then 'malformed_key'
      when catalog_matches > 0 and my_food_matches > 0 then 'ambiguous_uuid'
      when catalog_matches = 0 and cross_owner_my_food_matches > 0 then 'cross_owner_my_food'
      when catalog_matches = 0 and same_owner_deleted_my_food_matches > 0 then 'deleted_my_food'
      when catalog_matches = 0 and my_food_matches = 0 then 'unknown_uuid'
      else 'ambiguous_uuid'
    end as reason
  from resolution
)
select jsonb_build_object(
  'total', count(*),
  'catalog_mappable', count(*) filter (where disposition = 'catalog_mappable'),
  'catalog_already_mapped', count(*) filter (where disposition = 'catalog_already_mapped'),
  'my_food_preserved', count(*) filter (where disposition = 'my_food_preserved'),
  'legacy_text_preserved', count(*) filter (where disposition = 'legacy_text_preserved'),
  'blocked', count(*) filter (where disposition = 'blocked'),
  'personal_corrections', (select count(*) from public.food_personal_corrections)
  ${diagnosticProjection}
)
from classified;
rollback;
`;
}

function parseArgs(argv) {
  return {
    diagnostic: argv.includes("--diagnostic"),
    databaseUrl: process.env.PLAN7_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  };
}

export function runOwnerReconciliationReport({ databaseUrl, diagnostic = false }) {
  if (!databaseUrl) {
    throw new Error("PLAN7_DATABASE_URL (or DATABASE_URL) is required for the read-only owner reconciliation report.");
  }
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", buildOwnerReconciliationSql({ diagnostic })],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Owner reconciliation report failed: ${(result.stderr ?? "").trim()}`);
  }
  const payload = JSON.parse((result.stdout ?? "").trim());
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const payload = runOwnerReconciliationReport(options);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
