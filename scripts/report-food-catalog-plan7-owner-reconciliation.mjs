#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { classifyOwnerFavorite } from "../lib/food-catalog/plan7-owner-reconciliation.ts";

const UUID_SQL =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

export function stableFavoriteRowId(userId, foodKey) {
  return createHash("sha256").update(String(userId)).update("\0").update(String(foodKey)).digest("hex");
}

export function buildOwnerFavoriteReconciliationReadSql() {
  return `begin transaction isolation level repeatable read read only;

with legacy_favorites as materialized (
  select favorite.user_id, favorite.food_key
  from public.user_food_favorites favorite
),
uuid_favorites as materialized (
  select favorite.user_id, favorite.food_key::uuid as food_id
  from legacy_favorites favorite
  where favorite.food_key ~* '${UUID_SQL}'
)
select jsonb_build_object(
  'favorites',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', favorite.user_id::text,
          'foodKey', favorite.food_key
        )
        order by favorite.user_id::text, favorite.food_key
      )
      from legacy_favorites favorite
    ), '[]'::jsonb),
  'catalogFoodIds',
    coalesce((
      select jsonb_agg(food_id order by food_id)
      from (
        select distinct food.id::text as food_id
        from public.food_items food
        join uuid_favorites favorite on favorite.food_id = food.id
      ) catalog
    ), '[]'::jsonb),
  'myFoods',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', food.id::text,
          'userId', food.user_id::text,
          'deletedAt', food.deleted_at
        )
        order by food.id::text
      )
      from public.user_food_items food
      where exists (
        select 1
        from uuid_favorites favorite
        where favorite.food_id = food.id
      )
    ), '[]'::jsonb),
  'canonicalFavorites',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', favorite.user_id::text,
          'foodId', favorite.food_id::text
        )
        order by favorite.user_id::text, favorite.food_id::text
      )
      from public.food_favorites favorite
      where exists (
        select 1
        from uuid_favorites legacy
        where legacy.user_id = favorite.user_id
          and legacy.food_id = favorite.food_id
      )
    ), '[]'::jsonb),
  'personalCorrectionCount',
    (select count(*)::bigint from public.food_personal_corrections)
)::text;

rollback;`;
}

function sameUuid(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildOwnerFavoriteReconciliationReport(snapshot, options = {}) {
  const favorites = asArray(snapshot?.favorites);
  const catalogFoodIds = asArray(snapshot?.catalogFoodIds).map(String);
  const myFoods = asArray(snapshot?.myFoods).map((food) => ({
    id: String(food.id),
    userId: String(food.userId),
    deletedAt: food.deletedAt === null || food.deletedAt === undefined ? null : String(food.deletedAt),
  }));
  const canonicalFavorites = asArray(snapshot?.canonicalFavorites);
  const summary = {
    total: 0,
    catalog_mappable: 0,
    catalog_already_mapped: 0,
    my_food_preserved: 0,
    legacy_text_preserved: 0,
    blocked: 0,
    personal_correction_count: Number(snapshot?.personalCorrectionCount ?? 0),
  };
  const diagnostics = [];

  for (const favorite of favorites) {
    const row = {
      userId: String(favorite.userId),
      foodKey: String(favorite.foodKey),
    };
    const result = classifyOwnerFavorite(row, {
      catalogFoodIds,
      myFoods,
      existingCatalogFavoriteFoodIds: canonicalFavorites
        .filter((candidate) => sameUuid(candidate.userId, row.userId))
        .map((candidate) => String(candidate.foodId)),
    });
    summary.total += 1;
    summary[result.disposition] += 1;

    if (options.diagnostic === true) {
      diagnostics.push({
        row_id: stableFavoriteRowId(row.userId, row.foodKey),
        disposition: result.disposition,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    }
  }

  return options.diagnostic === true
    ? { ...summary, diagnostics }
    : summary;
}

function parseSnapshot(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith("{"));
  if (!jsonLine) throw new Error("Owner reconciliation query returned no JSON snapshot.");
  return JSON.parse(jsonLine);
}

export function runOwnerFavoriteReconciliationReport({
  databaseUrl,
  diagnostic = false,
  spawn = spawnSync,
} = {}) {
  if (!databaseUrl) {
    throw new Error(
      "Set PLAIVRA_OWNER_RECONCILIATION_DATABASE_URL or pass --database-url for a read-only owner reconciliation report.",
    );
  }
  const result = spawn(
    "psql",
    [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", buildOwnerFavoriteReconciliationReadSql()],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Owner reconciliation read-only query failed: ${String(result.stderr ?? "").trim()}`);
  }
  return buildOwnerFavoriteReconciliationReport(parseSnapshot(result.stdout), { diagnostic });
}

function cliOptions(argv) {
  let databaseUrl = process.env.PLAIVRA_OWNER_RECONCILIATION_DATABASE_URL ?? "";
  let diagnostic = false;
  for (const arg of argv) {
    if (arg === "--diagnostic") diagnostic = true;
    else if (arg.startsWith("--database-url=")) databaseUrl = arg.slice("--database-url=".length);
    else if (arg === "--help") {
      return { help: true, databaseUrl, diagnostic };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { help: false, databaseUrl, diagnostic };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = cliOptions(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(
        "Usage: node scripts/report-food-catalog-plan7-owner-reconciliation.mjs [--database-url=postgresql://...] [--diagnostic]\n",
      );
    } else {
      const report = runOwnerFavoriteReconciliationReport(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
