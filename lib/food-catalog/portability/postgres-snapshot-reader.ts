import type { LosslessPostgresRow } from "./export-reader";

export type SnapshotSourceObservation = Readonly<{
  environment: string;
  postgresSnapshot: string;
  capturedAt: string;
  migrationCount: string;
  latestMigration: string;
  migrationLedgerIdentity: string;
  currentGenerationId: string | null;
  pointerRevision: string;
  compatibilityVersion: string;
  compatibilityMarker: string;
}>;

export interface AuthoritativeSnapshotSession {
  readonly authority: "POSTGRES_MVCC";
  beginReadOnlyRepeatableRead(): Promise<void>;
  observeSource(): Promise<SnapshotSourceObservation>;
  streamRelation(relation: string): AsyncIterable<LosslessPostgresRow>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type AuthoritativeSnapshotView = Readonly<{
  observation: SnapshotSourceObservation;
  streamRelation: (relation: string) => AsyncIterable<LosslessPostgresRow>;
}>;

export class PostgresSnapshotReader {
  constructor(private readonly openSession: () => Promise<AuthoritativeSnapshotSession>) {}

  async withAuthoritativeSnapshot<T>(
    work: (snapshot: AuthoritativeSnapshotView) => Promise<T>,
  ): Promise<T> {
    const session = await this.openSession();
    if (session.authority !== "POSTGRES_MVCC") {
      throw new Error("Authoritative Plan 7 export requires a PostgreSQL MVCC snapshot session; REST pagination is diagnostic only.");
    }

    let begun = false;
    let active = true;
    try {
      await session.beginReadOnlyRepeatableRead();
      begun = true;
      const observation = await session.observeSource();
      if (!observation.postgresSnapshot) throw new Error("PostgreSQL snapshot identity was not captured inside the export transaction.");
      const view: AuthoritativeSnapshotView = Object.freeze({
        observation,
        streamRelation: (relation) => {
          if (!active) throw new Error("The authoritative snapshot transaction is no longer active.");
          return session.streamRelation(relation);
        },
      });
      const result = await work(view);
      await session.commit();
      active = false;
      return result;
    } catch (error) {
      active = false;
      if (begun) await session.rollback();
      throw error;
    }
  }
}
