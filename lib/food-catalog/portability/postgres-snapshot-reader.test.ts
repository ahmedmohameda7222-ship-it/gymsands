import { describe, expect, it } from "vitest";
import {
  PostgresSnapshotReader,
  type AuthoritativeSnapshotSession,
  type SnapshotSourceObservation,
} from "./postgres-snapshot-reader";
import type { LosslessPostgresRow } from "./export-reader";

const observation = (snapshot = "100:100:"): SnapshotSourceObservation => ({
  environment: "fixture",
  postgresSnapshot: snapshot,
  capturedAt: "2026-09-10 18:19:20.123456+00",
  migrationCount: "123",
  latestMigration: "20260910071241",
  migrationLedgerIdentity: "fixture-ledger",
  currentGenerationId: null,
  pointerRevision: "0",
  compatibilityVersion: "2",
  compatibilityMarker: "20260724232734",
});

function scalar(pgType: string, text: string | null) {
  return { pgType, text } as const;
}

class FakeSession implements AuthoritativeSnapshotSession {
  readonly authority = "POSTGRES_MVCC" as const;
  readonly calls: string[] = [];
  constructor(
    private readonly snapshotRows: Record<string, LosslessPostgresRow[]>,
    private readonly sourceObservation = observation(),
  ) {}
  async beginReadOnlyRepeatableRead() { this.calls.push("BEGIN READ ONLY REPEATABLE READ"); }
  async observeSource() { this.calls.push("OBSERVE"); return this.sourceObservation; }
  async *streamRelation(relation: string) {
    this.calls.push(`STREAM ${relation}`);
    for (const row of this.snapshotRows[relation] ?? []) yield row;
  }
  async commit() { this.calls.push("COMMIT"); }
  async rollback() { this.calls.push("ROLLBACK"); }
}

describe("Plan 7 PostgreSQL MVCC snapshot reader", () => {
  it("opens exactly one read-only REPEATABLE READ session and captures source observations inside it", async () => {
    const session = new FakeSession({ food_items: [] });
    let factoryCalls = 0;
    const reader = new PostgresSnapshotReader(async () => { factoryCalls += 1; return session; });

    await reader.withAuthoritativeSnapshot(async (snapshot) => {
      expect(snapshot.observation.postgresSnapshot).toBe("100:100:");
      expect(await Array.fromAsync(snapshot.streamRelation("food_items"))).toEqual([]);
    });

    expect(factoryCalls).toBe(1);
    expect(session.calls).toEqual([
      "BEGIN READ ONLY REPEATABLE READ",
      "OBSERVE",
      "STREAM food_items",
      "COMMIT",
    ]);
  });

  it("cannot tear across a concurrent committed write: one export sees one snapshot and a later export may see the next", async () => {
    const before: LosslessPostgresRow = { id: scalar("uuid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), pointer_revision: scalar("int8", "0") };
    const after: LosslessPostgresRow = { id: scalar("uuid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), pointer_revision: scalar("int8", "1") };
    let committed = false;

    const first = new PostgresSnapshotReader(async () => new FakeSession(
      { food_items: [before], food_catalog_current_generation: [before] },
      observation("100:100:"),
    ));
    const firstSeen = await first.withAuthoritativeSnapshot(async (snapshot) => {
      const a = await Array.fromAsync(snapshot.streamRelation("food_items"));
      committed = true; // represents another transaction committing between segments
      const b = await Array.fromAsync(snapshot.streamRelation("food_catalog_current_generation"));
      return [a[0].pointer_revision.text, b[0].pointer_revision.text, snapshot.observation.postgresSnapshot];
    });
    expect(committed).toBe(true);
    expect(firstSeen).toEqual(["0", "0", "100:100:"]);

    const second = new PostgresSnapshotReader(async () => new FakeSession(
      { food_items: [after], food_catalog_current_generation: [after] },
      { ...observation("101:101:"), pointerRevision: "1" },
    ));
    expect(await second.withAuthoritativeSnapshot(async (snapshot) => (
      await Array.fromAsync(snapshot.streamRelation("food_items"))
    )[0].pointer_revision.text)).toBe("1");
  });

  it("rejects a diagnostic/REST session as an authoritative exporter", async () => {
    const diagnostic = new FakeSession({}) as AuthoritativeSnapshotSession & { authority: string };
    Object.defineProperty(diagnostic, "authority", { value: "REST_PAGINATION" });
    const reader = new PostgresSnapshotReader(async () => diagnostic as AuthoritativeSnapshotSession);
    await expect(reader.withAuthoritativeSnapshot(async () => undefined)).rejects.toThrow(/MVCC|authoritative/i);
  });

  it("rolls back when export work fails", async () => {
    const session = new FakeSession({});
    const reader = new PostgresSnapshotReader(async () => session);
    await expect(reader.withAuthoritativeSnapshot(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(session.calls.at(-1)).toBe("ROLLBACK");
  });
});
