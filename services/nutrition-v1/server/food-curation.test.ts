import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertFoodCatalogOwner,
  deprecateFood,
  listFoodCatalogCandidates,
  mergeFood,
  publishFood,
  restoreFood,
  unverifyFood,
  verifyFood,
} from "@/services/nutrition-v1/server/food-curation";

const sourceFoodId = "11111111-1111-4111-8111-111111111111";
const targetFoodId = "22222222-2222-4222-8222-222222222222";
const sourceRecordId = "33333333-3333-4333-8333-333333333333";
const ingestionBatchId = "44444444-4444-4444-8444-444444444444";

type Result = { data: any; error: null | { message: string; code?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "insert", "upsert", "update", "delete", "eq", "in", "is", "neq", "order", "limit"]) q[method] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(tableQueries: Record<string, Query[]> = {}) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const seen: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    (seen[table] ??= []).push(next);
    return next;
  });
  return { client: { from } as unknown as SupabaseClient, from, seen };
}

const owner = { role: "admin" as const };
const member = { role: "user" as const };

describe("Nutrition V1 Food Catalog curation authorization", () => {
  it("denies non-owner actors before any catalog mutation", async () => {
    expect(() => assertFoodCatalogOwner(member)).toThrow(/owner|admin/i);
    const db = fakeSupabase();
    await expect(publishFood(db.client, member, sourceFoodId)).rejects.toThrow(/owner|admin/i);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("allows the existing admin role to act as the bounded Food Catalog owner authority", () => {
    expect(() => assertFoodCatalogOwner(owner)).not.toThrow();
  });
});

describe("Nutrition V1 Food Catalog readiness inspection", () => {
  it("shows brand, versioned provenance, and immutable ingestion batch participation to the privileged curator", async () => {
    const foods = query({
      data: [{
        id: sourceFoodId,
        food_name: "Greek Yogurt",
        brand_name: "Plaivra Foods",
        serving_size: "100 g",
        category: "Dairy",
        cuisine: null,
        calories: 120,
        protein_g: 10,
        carbs_g: 12,
        fat_g: 3,
        lifecycle_status: "draft",
        is_verified: false,
        verified_at: null,
        verified_source_record_id: null,
        merged_into_food_id: null,
      }],
      error: null,
    });
    const provenance = query({
      data: [{
        id: sourceRecordId,
        food_id: sourceFoodId,
        provider: "reviewed-source",
        source_record_id: "provider-record-1",
        source_dataset: "dataset",
        source_version: "2026.08",
        source_release_date: "2026-08-01",
        source_record_checksum_sha256: "a".repeat(64),
        source_reference: "source-ref",
        license_name: "Example License",
        license_reference: "license-ref",
        retrieved_at: "2026-08-30T00:00:00.000Z",
      }],
      error: null,
    });
    const participation = query({
      data: [{ source_record_id: sourceRecordId, batch_id: ingestionBatchId }],
      error: null,
    });
    const db = fakeSupabase({
      food_items: [foods],
      food_source_records: [provenance],
      food_ingestion_batch_records: [participation],
    });

    const result = await listFoodCatalogCandidates(db.client, owner, { limit: 10 });

    expect(foods.select).toHaveBeenCalledWith(expect.stringContaining("brand_name"));
    expect(provenance.select).toHaveBeenCalledWith(expect.stringContaining("source_version"));
    expect(provenance.select).toHaveBeenCalledWith(expect.stringContaining("source_record_checksum_sha256"));
    expect(participation.select).toHaveBeenCalledWith("source_record_id,batch_id");
    expect(result.candidates[0]).toMatchObject({
      id: sourceFoodId,
      brand_name: "Plaivra Foods",
      provenance: [{
        id: sourceRecordId,
        source_dataset: "dataset",
        source_version: "2026.08",
        source_release_date: "2026-08-01",
        source_record_checksum_sha256: "a".repeat(64),
        ingestion_batch_ids: [ingestionBatchId],
      }],
    });
  });
});

describe("Nutrition V1 Food Catalog lifecycle", () => {
  it("publishes a draft without silently verifying it", async () => {
    const update = query({ data: { id: sourceFoodId, lifecycle_status: "active", is_verified: false }, error: null });
    const db = fakeSupabase({ food_items: [update] });

    const result = await publishFood(db.client, owner, sourceFoodId);

    expect(result).toMatchObject({ id: sourceFoodId, lifecycle_status: "active", is_verified: false });
    expect(update.update).toHaveBeenCalledWith({ lifecycle_status: "active", merged_into_food_id: null });
    expect(JSON.stringify(update.update.mock.calls)).not.toMatch(/is_verified|verified_at|verified_source_record_id/);
  });

  it("requires provenance linked to the same Food before positive verification", async () => {
    const missing = query({ data: null, error: null });
    const db = fakeSupabase({ food_source_records: [missing] });

    await expect(verifyFood(db.client, owner, { foodId: sourceFoodId, sourceRecordId })).rejects.toThrow(/provenance|source/i);
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("verifies only from same-Food provenance with inspectable license evidence", async () => {
    const provenance = query({
      data: { id: sourceRecordId, food_id: sourceFoodId, provider: "reviewed-source", license_name: "CC BY 4.0", license_reference: "license-ref" },
      error: null,
    });
    const update = query({ data: { id: sourceFoodId, is_verified: true, verified_source_record_id: sourceRecordId }, error: null });
    const db = fakeSupabase({ food_source_records: [provenance], food_items: [update] });

    const result = await verifyFood(db.client, owner, { foodId: sourceFoodId, sourceRecordId, verifiedAt: "2026-08-26T07:00:00.000Z" });

    expect(provenance.eq).toHaveBeenCalledWith("food_id", sourceFoodId);
    expect(update.update).toHaveBeenCalledWith({
      is_verified: true,
      verified_at: "2026-08-26T07:00:00.000Z",
      verified_source_record_id: sourceRecordId,
    });
    expect(result.provenance.license_name).toBe("CC BY 4.0");
  });

  it("unverifies by clearing the complete verification assertion", async () => {
    const update = query({ data: { id: sourceFoodId, is_verified: false, verified_at: null, verified_source_record_id: null }, error: null });
    const db = fakeSupabase({ food_items: [update] });

    await unverifyFood(db.client, owner, sourceFoodId);

    expect(update.update).toHaveBeenCalledWith({ is_verified: false, verified_at: null, verified_source_record_id: null });
  });

  it("merges through a durable redirect, carries Favorites forward, and never rewrites historical logs", async () => {
    const source = query({ data: { id: sourceFoodId, lifecycle_status: "active", merged_into_food_id: null }, error: null });
    const target = query({ data: { id: targetFoodId, lifecycle_status: "active", merged_into_food_id: null }, error: null });
    const favorites = query({ data: [{ user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }], error: null });
    const carry = query({ data: null, error: null });
    const redirect = query({ data: { id: sourceFoodId, lifecycle_status: "merged", merged_into_food_id: targetFoodId }, error: null });
    const db = fakeSupabase({ food_items: [source, target, redirect], food_favorites: [favorites, carry] });

    const result = await mergeFood(db.client, owner, { sourceFoodId, targetFoodId });

    expect(carry.upsert).toHaveBeenCalledWith([
      { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", food_id: targetFoodId },
      { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", food_id: targetFoodId },
    ], { onConflict: "user_id,food_id", ignoreDuplicates: true });
    expect(redirect.update).toHaveBeenCalledWith({ lifecycle_status: "merged", merged_into_food_id: targetFoodId });
    expect(result).toMatchObject({ id: sourceFoodId, merged_into_food_id: targetFoodId });
    expect(db.from).not.toHaveBeenCalledWith("food_logs");
  });

  it("deprecates and restores the same canonical Food without deleting history", async () => {
    const deprecated = query({ data: { id: sourceFoodId, lifecycle_status: "deprecated" }, error: null });
    const restored = query({ data: { id: sourceFoodId, lifecycle_status: "active" }, error: null });
    const db = fakeSupabase({ food_items: [deprecated, restored] });

    expect((await deprecateFood(db.client, owner, sourceFoodId)).lifecycle_status).toBe("deprecated");
    expect((await restoreFood(db.client, owner, sourceFoodId)).lifecycle_status).toBe("active");
    expect(db.from).not.toHaveBeenCalledWith("food_logs");
  });
});
