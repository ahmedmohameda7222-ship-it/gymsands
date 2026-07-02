export type AccessLookupResult =
  | { ok: true; values: string[] }
  | { ok: false; reason: "read_failed" };
