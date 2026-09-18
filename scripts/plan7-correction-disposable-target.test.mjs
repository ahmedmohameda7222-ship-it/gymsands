import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDisposableRestoreTarget } from "./restore-food-catalog-portable.mjs";

describe("Plan 7 certification restore target safety", () => {
  it("rejects every arbitrary remote PostgreSQL target even when the caller acknowledges disposable intent", () => {
    for (const url of [
      "postgresql://db.internal.example:5432/restore",
      "postgresql://plan7.abc123.us-east-1.rds.amazonaws.com:5432/restore",
      "postgresql://project.supabase.co:5432/postgres",
      "postgresql://staging-db.example.net:5432/restore",
    ]) {
      assert.throws(
        () => assertDisposableRestoreTarget(url, true),
        /loopback|remote|disposable|certification|forbidden/i,
        url,
      );
    }
  });

  it("requires explicit disposable intent but accepts the isolated loopback PostgreSQL harness", () => {
    assert.throws(
      () => assertDisposableRestoreTarget("postgresql://127.0.0.1:55432/restore", false),
      /disposable/i,
    );
    assert.doesNotThrow(() => assertDisposableRestoreTarget("postgresql://127.0.0.1:55432/restore", true));
    assert.doesNotThrow(() => assertDisposableRestoreTarget("postgresql://localhost:55432/restore", true));
  });
});
