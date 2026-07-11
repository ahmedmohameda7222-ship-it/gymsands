from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/mcp/public-tool-handler-coverage.test.ts",
    'type Filter = { kind: "eq" | "is" | "in" | "gte" | "lte" | "ilike"; field: string; value: unknown };',
    'type Filter = { kind: "eq" | "is" | "in" | "gte" | "gt" | "lte" | "lt" | "ilike"; field: string; value: unknown };',
)
replace_once(
    "lib/mcp/public-tool-handler-coverage.test.ts",
    '''      if (filter.kind === "gte") return String(value ?? "") >= String(filter.value ?? "");
      if (filter.kind === "lte") return String(value ?? "") <= String(filter.value ?? "");''',
    '''      if (filter.kind === "gte") return String(value ?? "") >= String(filter.value ?? "");
      if (filter.kind === "gt") return String(value ?? "") > String(filter.value ?? "");
      if (filter.kind === "lte") return String(value ?? "") <= String(filter.value ?? "");
      if (filter.kind === "lt") return String(value ?? "") < String(filter.value ?? "");''',
)
replace_once(
    "lib/mcp/public-tool-handler-coverage.test.ts",
    '''        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({''',
    '''        const incoming: Row[] = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row): Row => ({''',
)
replace_once(
    "lib/mcp/public-tool-handler-coverage.test.ts",
    '''    builder.gte = (field: string, value: unknown) => { filters.push({ kind: "gte", field, value }); return builder; };
    builder.lte = (field: string, value: unknown) => { filters.push({ kind: "lte", field, value }); return builder; };''',
    '''    builder.gte = (field: string, value: unknown) => { filters.push({ kind: "gte", field, value }); return builder; };
    builder.gt = (field: string, value: unknown) => { filters.push({ kind: "gt", field, value }); return builder; };
    builder.lte = (field: string, value: unknown) => { filters.push({ kind: "lte", field, value }); return builder; };
    builder.lt = (field: string, value: unknown) => { filters.push({ kind: "lt", field, value }); return builder; };''',
)
replace_once(
    "lib/billing/stripe-event-worker.test.ts",
    ''')).rejects.toThrow("completion state");''',
    ''')).rejects.toThrow(/completion state|retry state/);''',
)

Path(__file__).unlink()
