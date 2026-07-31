const { readFileSync, writeFileSync } = require("node:fs");

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one replacement target`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const verificationPath =
  "supabase/verification/active-workout-aw2b-integration.sql";
replaceOnce(
  verificationPath,
  `) as controller_conflict_response \\gset
select pg_temp.assert_true(`,
  `) as controller_conflict_response \\gset
reset role;
select pg_temp.assert_true(`,
);
replaceOnce(
  verificationPath,
  `  'Identity-bearing ordinary command bypassed claim_control or mutated the unclaimed session.');

reset role;

insert into public.user_workout_plans`,
  `  'Identity-bearing ordinary command bypassed claim_control or mutated the unclaimed session.');

insert into public.user_workout_plans`,
);

const realtimePath = "services/database/active-session-realtime.ts";
replaceOnce(
  realtimePath,
  `import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";`,
  `import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";`,
);
replaceOnce(
  realtimePath,
  `  if (
    !supabase`,
  `  if (
    env.productionQaBuild
    || !supabase`,
);

const contractPath = "lib/product/active-workout-aw9-offline-contract.test.ts";
replaceOnce(
  contractPath,
  `const realtime = readFileSync(
  "services/database/active-session-realtime.ts",
  "utf8",
);`,
  `const realtime = readFileSync(
  "services/database/active-session-realtime.ts",
  "utf8",
);
const aw2bVerification = readFileSync(
  "supabase/verification/active-workout-aw2b-integration.sql",
  "utf8",
);`,
);
replaceOnce(
  contractPath,
  `  it("uses scoped invalidation-only Realtime with cleanup and no polling", () => {
    expect(realtime).toContain("postgres_changes");`,
  `  it("keeps internal command receipts private during authenticated verification", () => {
    expect(aw2bVerification).toContain(
      ") as controller_conflict_response \\\\gset\\nreset role;\\nselect pg_temp.assert_true(",
    );
  });

  it("uses scoped invalidation-only Realtime with cleanup and no polling", () => {
    expect(realtime).toContain("env.productionQaBuild");
    expect(realtime).toContain("postgres_changes");`,
);
