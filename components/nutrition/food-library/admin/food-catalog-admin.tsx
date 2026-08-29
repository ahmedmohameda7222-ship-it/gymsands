"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  FoodCatalogCandidateReview,
  FoodCatalogCommand,
  FoodCatalogSnapshot,
} from "@/services/nutrition-v1/server/food-curation";

type Props = {
  execute: (accessToken: string, command: FoodCatalogCommand) => Promise<FoodCatalogSnapshot>;
};

function macro(value: number | null, suffix: string) {
  return value === null ? "Unknown" : `${value}${suffix}`;
}

function statusLabel(food: FoodCatalogCandidateReview) {
  if (food.lifecycle_status === "merged" && food.merged_into_food_id) return `Merged → ${food.merged_into_food_id}`;
  return food.lifecycle_status;
}

export function FoodCatalogAdmin({ execute }: Props) {
  const [snapshot, setSnapshot] = useState<FoodCatalogSnapshot>({ candidates: [] });
  const [loading, setLoading] = useState(true);
  const [pendingFoodId, setPendingFoodId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (command: FoodCatalogCommand, foodId?: string) => {
    if (!supabase) {
      setError("Database not connected.");
      setLoading(false);
      return;
    }
    setError(null);
    if (foodId) setPendingFoodId(foodId);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Admin session expired.");
      const next = await execute(accessToken, command);
      setSnapshot(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Food Catalog curation failed.");
    } finally {
      setLoading(false);
      setPendingFoodId(null);
    }
  }, [execute]);

  useEffect(() => {
    void run({ kind: "list" });
  }, [run]);

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review candidates</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Normalize source-backed Foods before publication. Publish does not verify; verification is a separate positive assertion tied to same-Food provenance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void run({ kind: "list" })}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Refresh
          </button>
        </div>
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          User-created Foods stay personal until explicitly reviewed. This workspace never silently merges personal Food into the shared catalog.
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading Food Catalog…</p> : null}
      {!loading && snapshot.candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No canonical Food candidates are available for review.
        </p>
      ) : null}

      <div className="space-y-3">
        {snapshot.candidates.map((food) => {
          const busy = pendingFoodId === food.id;
          const provenance = food.provenance[0] ?? null;
          return (
            <article key={food.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{food.food_name}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                      {statusLabel(food)}
                    </span>
                    {food.is_verified ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">Verified</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{food.id}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {food.serving_size ?? "Serving unknown"} · {macro(food.calories, " kcal")} · P {macro(food.protein_g, "g")} · C {macro(food.carbs_g, "g")} · F {macro(food.fat_g, "g")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {food.lifecycle_status === "draft" ? (
                    <button type="button" disabled={busy} onClick={() => void run({ kind: "publish", foodId: food.id }, food.id)} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Publish</button>
                  ) : null}
                  {food.is_verified ? (
                    <button type="button" disabled={busy} onClick={() => void run({ kind: "unverify", foodId: food.id }, food.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Unverify</button>
                  ) : provenance ? (
                    <button type="button" disabled={busy} onClick={() => void run({ kind: "verify", foodId: food.id, sourceRecordId: provenance.id }, food.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Verify</button>
                  ) : null}
                  {food.lifecycle_status === "deprecated" ? (
                    <button type="button" disabled={busy} onClick={() => void run({ kind: "restore", foodId: food.id }, food.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Restore</button>
                  ) : food.lifecycle_status !== "merged" ? (
                    <button type="button" disabled={busy} onClick={() => void run({ kind: "deprecate", foodId: food.id }, food.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Deprecate</button>
                  ) : null}
                </div>
              </div>

              <form
                className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void run({
                    kind: "normalize",
                    input: {
                      foodId: food.id,
                      food_name: String(values.get("food_name") ?? ""),
                      category: String(values.get("category") ?? ""),
                      cuisine: String(values.get("cuisine") ?? ""),
                    },
                  }, food.id);
                }}
              >
                <label className="text-xs font-medium text-muted-foreground">
                  Normalized name
                  <input name="food_name" defaultValue={food.food_name} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Category
                  <input name="category" defaultValue={food.category ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Cuisine
                  <input name="cuisine" defaultValue={food.cuisine ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" />
                </label>
                <button type="submit" disabled={busy} className="min-h-11 self-end rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Normalize</button>
              </form>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provenance</p>
                  {food.provenance.length ? food.provenance.map((source) => (
                    <div key={source.id} className="mt-2 text-sm text-foreground">
                      <p>{source.provider} · {source.source_record_id}</p>
                      <p className="text-xs text-muted-foreground">License: {source.license_name}{source.license_reference ? ` · ${source.license_reference}` : ""}</p>
                    </div>
                  )) : <p className="mt-2 text-sm text-muted-foreground">No source evidence attached.</p>}
                </div>

                {food.lifecycle_status !== "merged" ? (
                  <form
                    className="rounded-xl bg-muted/40 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      const targetFoodId = String(values.get("target_food_id") ?? "").trim();
                      if (targetFoodId) void run({ kind: "merge", sourceFoodId: food.id, targetFoodId }, food.id);
                    }}
                  >
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Merge target Food ID
                      <input name="target_food_id" placeholder="Canonical target UUID" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm normal-case tracking-normal text-foreground" />
                    </label>
                    <button type="submit" disabled={busy} className="mt-2 min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">Merge</button>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
