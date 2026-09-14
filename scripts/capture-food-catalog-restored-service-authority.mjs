#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SERVICE_PRINCIPAL_ID = "71000000-0000-4000-8000-000000000d10";
const SERVICE_CAPABILITY_ID = "71000000-0000-4000-8000-000000000d11";
const OUTBOX_EVENT_ID = "71000000-0000-4000-8000-000000000d13";
const AUTHENTICATED_OWNER_ID = "71000000-0000-4000-8000-000000000001";
const RANDOM_UNBOUND_IDENTITY = "plan7-restored-random-unbound-service";

function psql(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Restored Service authority evidence query failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
}

function booleanEvidence(databaseUrl, sql, label) {
  const value = psql(databaseUrl, sql);
  if (value !== "t") throw new Error(`Restored Service authority proof failed: ${label}.`);
  return true;
}

function rejectedClaimSql({ role, claims, flag }) {
  const escapedClaims = JSON.stringify(claims).replaceAll("'", "''");
  return `begin;
set local role ${role};
select set_config('request.jwt.claims','${escapedClaims}',true);
do $plan7_service_binding$
begin
  begin
    perform public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 restored Service authority unexpectedly claimed the pending event';
  exception when insufficient_privilege then
    perform set_config('${flag}','true',true);
  end;
end
$plan7_service_binding$;
select current_setting('${flag}',true)='true';
rollback;`;
}

export function captureRestoredServiceAuthority(databaseUrl, sourceIdentity) {
  if (typeof sourceIdentity !== "string" || sourceIdentity.length === 0) throw new Error("A non-empty source Service identity is required for restored-authority proof.");
  const escapedSourceIdentity = sourceIdentity.replaceAll("'", "''");

  const principalHistoryPreserved = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_principals
  where id='${SERVICE_PRINCIPAL_ID}'::uuid
    and principal_type='service'
    and subject_id='plan7-portability-service'
    and human_user_id is null
    and role_class='service'
    and active is true
    and revoked_at is null
    and created_at='2026-09-10T18:26:00Z'::timestamptz
    and service_identity_sha256 ~ '^[0-9a-f]{64}$'
    and service_identity_sha256 <> encode(extensions.digest(convert_to('${escapedSourceIdentity}','UTF8'),'sha256'),'hex')
);`, "principalHistoryPreserved");

  const capabilityHistoryPreserved = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_capability_assignments
  where id='${SERVICE_CAPABILITY_ID}'::uuid
    and principal_id='${SERVICE_PRINCIPAL_ID}'::uuid
    and capability='food.outbox.deliver'
    and granted_at='2026-09-10T18:26:10Z'::timestamptz
    and reason='plan7 fixture delivery history'
    and revoked_at is null
);`, "capabilityHistoryPreserved");

  const sourceServiceIdentityRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "service_role",
    claims: { role: "service_role", plaivra_food_service_identity: sourceIdentity },
    flag: "plan7.source_service_identity_rejected",
  }), "sourceServiceIdentityRejected");

  const randomServiceIdentityRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "service_role",
    claims: { role: "service_role", plaivra_food_service_identity: RANDOM_UNBOUND_IDENTITY },
    flag: "plan7.random_service_identity_rejected",
  }), "randomServiceIdentityRejected");

  const authenticatedClaimRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "authenticated",
    claims: { role: "authenticated", sub: AUTHENTICATED_OWNER_ID },
    flag: "plan7.authenticated_service_claim_rejected",
  }), "authenticatedClaimRejected");

  const outboxPendingUnclaimed = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_outbox
  where event_id='${OUTBOX_EVENT_ID}'::uuid
    and status='pending'
    and attempt_count=4
    and lease_epoch=9
    and claim_owner is null
    and claim_principal_id is null
    and lease_token is null
    and lease_acquired_at is null
    and lease_expires_at is null
    and delivered_at is null
    and last_error is null
);`, "outboxPendingUnclaimed");

  return Object.freeze({
    format: "plaivra-food-catalog-restored-service-authority-evidence",
    version: 1,
    sourceServiceIdentityRejected,
    authenticatedClaimRejected,
    randomServiceIdentityRejected,
    principalHistoryPreserved,
    capabilityHistoryPreserved,
    outboxPendingUnclaimed,
    serviceExecutionBindingUnavailable: true,
    automaticDeliveryObserved: false,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const result = argv[++index];
      if (!result) throw new Error(`${value} requires a value.`);
      return result;
    };
    if (value === "--database-url") options.databaseUrl = next();
    else if (value === "--source-identity") options.sourceIdentity = next();
    else if (value === "--output") options.output = next();
    else throw new Error(`Unknown restored Service authority option ${value}.`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = options.databaseUrl ?? process.env.PLAN7_RESTORE_DATABASE_URL;
  if (!databaseUrl) throw new Error("--database-url or PLAN7_RESTORE_DATABASE_URL is required.");
  if (!options.sourceIdentity) throw new Error("--source-identity is required.");
  const evidence = captureRestoredServiceAuthority(databaseUrl, options.sourceIdentity);
  if (options.output) await writeFile(resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});