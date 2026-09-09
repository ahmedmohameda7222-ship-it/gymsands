from pathlib import Path


def replace_sql_function(text: str, name: str, replacement: str) -> str:
    marker = f"create or replace function public.{name}("
    start = text.index(marker)
    end = text.index("\n$function$;", start) + len("\n$function$;")
    return text[:start] + replacement.strip() + text[end:]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


migration_path = Path("supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql")
migration = migration_path.read_text()

migration = replace_once(
    migration,
    "  reporter_user_id uuid not null,\n  description text not null check (length(btrim(description)) between 1 and 2000),",
    "  reporter_user_id uuid not null,\n  claim_text text not null check (length(btrim(claim_text)) between 1 and 240),\n  description text not null check (length(btrim(description)) between 1 and 2000),",
    "member claim payload column",
)

report_function = r'''create or replace function public.food_catalog_report_correction(
  p_food_id uuid,p_category text,p_claim_key text,p_description text,p_evidence jsonb default '{}'::jsonb,p_policy_version text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_policy text; v_issue text; v_case uuid:=gen_random_uuid(); v_report uuid; v_case_claim text;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated reporter is required.' using errcode='42501'; end if;
  perform private.food_catalog_lock_account_purge(v_user);
  perform 1 from auth.users where id=v_user; if not found then raise exception 'Reporter Auth identity is unavailable.' using errcode='42501'; end if;
  perform 1 from public.account_access_states where user_id=v_user and state='active' and disabled_at is null;
  if not found then raise exception 'Reporter account is not active.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_resolve_policy_version(p_policy_version);
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid correction category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Correction report text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Correction report evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found.' using errcode='23503'; end if;

  -- Member free text is never part of durable global case identity. Each member
  -- intake gets a server-generated non-personal identity and can later be
  -- reconciled by governed curator workflow using canonical domain selectors.
  v_case_claim:='member-report:'||v_case::text;
  v_issue:=lower(p_food_id::text||'|'||p_category||'|'||v_case_claim);
  insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,policy_version)
  values(v_case,p_food_id,p_category,v_case_claim,v_issue,v_policy);
  insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,policy_version,reason)
  values(v_case,null,'reported',0,v_policy,'member-report');
  insert into public.food_catalog_correction_reports(case_id) values(v_case) returning id into v_report;
  insert into public.food_catalog_correction_report_member_payloads(report_id,reporter_user_id,claim_text,description,evidence)
  values(v_report,v_user,btrim(p_claim_key),btrim(p_description),coalesce(p_evidence,'{}'::jsonb));
  return jsonb_build_object('caseId',v_case,'reportId',v_report,'canonicalMutation',false,'policyVersion',v_policy);
end
$function$;'''
migration = replace_sql_function(migration, "food_catalog_report_correction", report_function)

queue_function = r'''-- Durable deletion authority is established before any access/governance disable.
-- Lock order remains account-purge user -> governance recovery set.
create or replace function public.food_catalog_queue_account_deletion(
  p_user_id uuid,
  p_request_id uuid,
  p_subject_hash text,
  p_idempotency_key_hash text,
  p_reauthenticated_at timestamptz,
  p_impact_version text,
  p_notification_recipient_ciphertext text,
  p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_state text; v_principal uuid; v_role text; v_request public.privacy_requests%rowtype;
  v_job public.account_deletion_jobs%rowtype; v_existing boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'Account deletion queue requires service_role.' using errcode='42501'; end if;
  if p_user_id is null or length(btrim(coalesce(p_subject_hash,'')))<1 or length(btrim(coalesce(p_idempotency_key_hash,'')))<1
     or p_reauthenticated_at is null or length(btrim(coalesce(p_impact_version,'')))<1
     or jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' then
    raise exception 'Account deletion durable queue inputs are invalid.' using errcode='22023';
  end if;
  perform private.food_catalog_lock_account_purge(p_user_id);

  select * into v_job from public.account_deletion_jobs
  where idempotency_key_hash=p_idempotency_key_hash for update;
  if found then
    if v_job.user_id is distinct from p_user_id then raise exception 'Deletion idempotency authority belongs to another account.' using errcode='23514'; end if;
    select * into v_request from public.privacy_requests where id=v_job.request_id;
    return jsonb_build_object(
      'requestId',v_job.request_id,'requestStatus',coalesce(v_request.status,'pending'),'requestCreatedAt',v_request.created_at,
      'jobId',v_job.id,'jobState',v_job.state,'jobStage',v_job.stage,'attemptCount',v_job.attempt_count,
      'nextAttemptAt',v_job.next_attempt_at,'lastErrorCode',v_job.last_error_code,'notificationStatus',v_job.notification_status,
      'jobCreatedAt',v_job.created_at,'completedAt',v_job.completed_at,'alreadyExists',true
    );
  end if;

  perform private.food_catalog_governance_lock_recovery_set();
  perform 1 from auth.users where id=p_user_id; if not found then raise exception 'Deletion Auth identity is unavailable.' using errcode='23503'; end if;
  select state into v_state from public.account_access_states where user_id=p_user_id for update;
  if not found or v_state<>'active' or exists(select 1 from public.account_access_states where user_id=p_user_id and disabled_at is not null) then
    raise exception 'Account must remain active until durable deletion authority is queued.' using errcode='55000';
  end if;

  select id,role_class into v_principal,v_role from public.food_catalog_governance_principals
  where principal_type='human' and human_user_id=p_user_id and active for update;
  if v_principal is not null and v_role='owner' and exists(
    select 1 from public.food_catalog_governance_capability_assignments
    where principal_id=v_principal and capability='food.governance.manage_principals' and revoked_at is null
  ) then
    perform private.food_catalog_governance_assert_recovery_survives(v_principal);
  end if;

  if p_request_id is not null then
    select * into v_request from public.privacy_requests
    where id=p_request_id and user_id=p_user_id and request_type='deletion' and status in ('pending','in_progress') for update;
    if not found then raise exception 'Existing deletion request is not usable for durable queue authority.' using errcode='23503'; end if;
  else
    select * into v_request from public.privacy_requests
    where user_id=p_user_id and request_type='deletion' and idempotency_key_hash=p_idempotency_key_hash
      and status in ('pending','in_progress') order by created_at desc limit 1 for update;
    if not found then
      insert into public.privacy_requests(
        user_id,request_type,status,message,reauthenticated_at,impact_version,idempotency_key_hash
      ) values(
        p_user_id,'deletion','pending','Submitted after explicit impact acknowledgement.',p_reauthenticated_at,p_impact_version,p_idempotency_key_hash
      ) returning * into v_request;
    else
      v_existing:=true;
    end if;
  end if;

  insert into public.account_deletion_jobs(
    request_id,user_id,subject_hash,idempotency_key_hash,state,stage,notification_recipient_ciphertext,evidence
  ) values(
    v_request.id,p_user_id,btrim(p_subject_hash),btrim(p_idempotency_key_hash),'queued','queued',p_notification_recipient_ciphertext,coalesce(p_evidence,'{}'::jsonb)
  ) returning * into v_job;

  return jsonb_build_object(
    'requestId',v_request.id,'requestStatus',v_request.status,'requestCreatedAt',v_request.created_at,
    'jobId',v_job.id,'jobState',v_job.state,'jobStage',v_job.stage,'attemptCount',v_job.attempt_count,
    'nextAttemptAt',v_job.next_attempt_at,'lastErrorCode',v_job.last_error_code,'notificationStatus',v_job.notification_status,
    'jobCreatedAt',v_job.created_at,'completedAt',v_job.completed_at,'alreadyExists',v_existing
  );
end
$function$;

'''
begin_marker = "create or replace function public.food_catalog_begin_account_deletion("
begin_pos = migration.index(begin_marker)
migration = migration[:begin_pos] + queue_function + migration[begin_pos:]

begin_function = r'''create or replace function public.food_catalog_begin_account_deletion(p_user_id uuid,p_deletion_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state text; v_principal uuid; v_role text; v_was_active boolean:=false; v_job public.account_deletion_jobs%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Account deletion governance transition requires service_role.' using errcode='42501'; end if;
  if p_user_id is null or p_deletion_job_id is null then raise exception 'Account deletion user and durable job IDs are required.' using errcode='22023'; end if;
  perform private.food_catalog_lock_account_purge(p_user_id);
  perform private.food_catalog_governance_lock_recovery_set();

  select * into v_job from public.account_deletion_jobs
  where id=p_deletion_job_id and user_id=p_user_id and state in ('queued','processing','retry_scheduled') for update;
  if not found then raise exception 'Durable retryable account deletion job is required before disabling access.' using errcode='23514'; end if;
  perform 1 from auth.users where id=p_user_id; if not found then raise exception 'Account deletion Auth identity is unavailable.' using errcode='23503'; end if;
  select state into v_state from public.account_access_states where user_id=p_user_id for update;
  if not found then raise exception 'Account deletion requires canonical account access state.' using errcode='23503'; end if;
  if v_state not in ('active','deletion_pending','deletion_processing') then
    raise exception 'Account state does not permit canonical deletion transition.' using errcode='55000';
  end if;

  select id,role_class,active into v_principal,v_role,v_was_active
  from public.food_catalog_governance_principals
  where principal_type='human' and human_user_id=p_user_id for update;
  if v_principal is not null and v_was_active then
    if v_role='owner' and exists(
      select 1 from public.food_catalog_governance_capability_assignments
      where principal_id=v_principal and capability='food.governance.manage_principals' and revoked_at is null
    ) then
      perform private.food_catalog_governance_assert_recovery_survives(v_principal);
    end if;
  end if;

  -- Session revocation and governance/access transition are one DB transaction.
  -- Any failure rolls these changes back while the durable job remains retryable.
  delete from auth.sessions where user_id=p_user_id;
  if v_principal is not null and v_was_active then
    update public.food_catalog_governance_principals
    set active=false,revoked_at=coalesce(revoked_at,clock_timestamp()) where id=v_principal;
  end if;
  if v_state='active' then
    update public.account_access_states
    set state='deletion_pending',reason_code='member_requested_deletion',disabled_at=coalesce(disabled_at,clock_timestamp()),updated_at=clock_timestamp()
    where user_id=p_user_id;
    v_state:='deletion_pending';
  end if;
  return jsonb_build_object('userId',p_user_id,'deletionJobId',p_deletion_job_id,'accountState',v_state,'governancePrincipalId',v_principal,'governancePrincipalDeactivated',coalesce(v_was_active,false));
end
$function$;'''
migration = replace_sql_function(migration, "food_catalog_begin_account_deletion", begin_function)

migration = replace_once(
    migration,
    "revoke all on function public.food_catalog_begin_account_deletion(uuid) from public,anon,authenticated,service_role;\ngrant execute on function public.food_catalog_begin_account_deletion(uuid) to service_role;",
    "revoke all on function public.food_catalog_queue_account_deletion(uuid,uuid,text,text,timestamptz,text,text,jsonb) from public,anon,authenticated,service_role;\n"
    "grant execute on function public.food_catalog_queue_account_deletion(uuid,uuid,text,text,timestamptz,text,text,jsonb) to service_role;\n"
    "revoke all on function public.food_catalog_begin_account_deletion(uuid,uuid) from public,anon,authenticated,service_role;\n"
    "grant execute on function public.food_catalog_begin_account_deletion(uuid,uuid) to service_role;",
    "deletion RPC ACL",
)
migration_path.write_text(migration)

# Route: browser request establishes durable authority only; the worker owns all retryable revocation/disable work.
route_path = Path("app/api/user/privacy-requests/route.ts")
route = route_path.read_text()
helper_start = route.index("async function revokeDeletionConnections(")
helper_end = route.index("export async function GET", helper_start)
route = route[:helper_start] + route[helper_end:]
create_start = route.index("async function createAccountDeletionRequest(")
new_create = r'''async function createAccountDeletionRequest(
  context: Exclude<Awaited<ReturnType<typeof requireUser>>, NextResponse>,
  body: RequestBody
) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Account deletion processing is not configured." }, { status: 503 });
  }
  const validated = validateAccountDeletionRequest(body);
  if (!validated.ok) return NextResponse.json({ error: validated.message, code: validated.code }, { status: 400 });
  if (!isRecentReauthentication(context.user.last_sign_in_at)) {
    return NextResponse.json(
      { error: "Sign in again before requesting account deletion.", code: "recent_reauthentication_required" },
      { status: 403 }
    );
  }

  const admin = createSupabaseAdminClient();
  const replay = await admin.from("account_deletion_jobs")
    .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
    .eq("idempotency_key_hash", validated.idempotencyKeyHash).maybeSingle();
  if (replay.error) return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
  if (replay.data) {
    return NextResponse.json({
      request: { id: replay.data.request_id, request_type: "deletion", status: replay.data.state },
      deletion_job: safeDeletionJob(replay.data), already_exists: true, deletion_queued: true
    });
  }

  const activeRequest = await admin.from("privacy_requests")
    .select("id,request_type,status,created_at")
    .eq("user_id", context.user.id).eq("request_type", "deletion")
    .in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (activeRequest.error) return NextResponse.json({ error: "Deletion request status could not be checked." }, { status: 500 });
  if (activeRequest.data) {
    const existingJob = await admin.from("account_deletion_jobs")
      .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
      .eq("request_id", activeRequest.data.id).maybeSingle();
    if (existingJob.error) return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
    if (existingJob.data) return NextResponse.json({ request: activeRequest.data, deletion_job: safeDeletionJob(existingJob.data), already_exists: true, deletion_queued: true });
  }

  const queued = await admin.rpc("food_catalog_queue_account_deletion", {
    p_user_id: context.user.id,
    p_request_id: activeRequest.data?.id ?? null,
    p_subject_hash: deletionSubjectHash(context.user.id),
    p_idempotency_key_hash: validated.idempotencyKeyHash,
    p_reauthenticated_at: new Date().toISOString(),
    p_impact_version: ACCOUNT_DELETION_IMPACT_VERSION,
    p_notification_recipient_ciphertext: context.user.email && serverEnv.privacyNotificationEncryptionKey
      ? encryptDeletionNotificationRecipient(context.user.email, serverEnv.privacyNotificationEncryptionKey)
      : null,
    p_evidence: { request_source: "account_settings", impact_version: ACCOUNT_DELETION_IMPACT_VERSION }
  });
  if (queued.error) {
    console.error("Plaivra durable deletion queue failed:", queued.error.message);
    if (queued.error.code === "23514") {
      return NextResponse.json({
        error: "Account deletion is blocked while this account is the final usable Food governance recovery Owner. Provision another usable Owner first."
      }, { status: 409 });
    }
    return NextResponse.json({ error: "The deletion request could not be queued safely; account access remains unchanged." }, { status: 500 });
  }
  const data = queued.data && typeof queued.data === "object" && !Array.isArray(queued.data)
    ? queued.data as Record<string, unknown> : null;
  if (!data || typeof data.requestId !== "string" || typeof data.jobId !== "string") {
    return NextResponse.json({ error: "Deletion queue returned an invalid durable authority result." }, { status: 500 });
  }

  return NextResponse.json({
    request: { id: data.requestId, request_type: "deletion", status: data.requestStatus ?? "pending", created_at: data.requestCreatedAt ?? null },
    deletion_job: safeDeletionJob({
      id: data.jobId, state: data.jobState ?? "queued", stage: data.jobStage ?? "queued",
      attempt_count: data.attemptCount ?? 0, next_attempt_at: data.nextAttemptAt ?? null,
      last_error_code: data.lastErrorCode ?? null, notification_status: data.notificationStatus ?? "pending",
      created_at: data.jobCreatedAt ?? null, completed_at: data.completedAt ?? null
    }),
    already_exists: Boolean(data.alreadyExists), deletion_queued: true
  }, { status: data.alreadyExists ? 200 : 201 });
}
'''
route = route[:create_start] + new_create
route_path.write_text(route)

worker_path = Path("lib/privacy/account-deletion-worker.ts")
worker = worker_path.read_text()
old_disable_start = worker.index("async function disableAccount(")
old_disable_end = worker.index("\nasync function removeStorageObjects", old_disable_start)
new_disable = r'''async function disableAccount(admin: SupabaseClient, userId: string, jobId: string) {
  const governanceDeletion = await admin.rpc("food_catalog_begin_account_deletion", {
    p_user_id: userId,
    p_deletion_job_id: jobId
  });
  if (governanceDeletion.error) throw new DeletionWorkerError("governance_recovery_owner_blocked");
  const result = await admin.from("account_access_states").upsert({
    user_id: userId,
    state: "deletion_processing",
    reason_code: "account_deletion_in_progress",
    disabled_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  const authDisable = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (result.error || authDisable.error) throw new DeletionWorkerError("account_disable_failed");
}
'''
worker = worker[:old_disable_start] + new_disable + worker[old_disable_end:]
worker = replace_once(worker, "await disableAccount(admin, job.user_id);", "await disableAccount(admin, job.user_id, job.id);", "worker durable job id")
worker = worker.replace(
    "// account is already denied by deletion_pending, so failing closed here\n      // does not restore access or falsely claim provider revocation.",
    "// Durable deletion authority already exists, but the account remains usable\n      // until provider/connection preflight succeeds and disabling_access begins."
)
worker_path.write_text(worker)

page_path = Path("app/(private)/settings/account/page.tsx")
page = page_path.read_text()
page = page.replace(
    "ChatGPT access is revoked immediately. After legal-hold checks, Plaivra disables access, deletes private storage, removes or anonymizes account data, and deletes the Auth account.",
    "Plaivra first records a durable retryable deletion job. The worker then revokes connections and sessions before disabling access, deleting private storage, removing or anonymizing account data, and deleting the Auth account."
)
page = page.replace(
    "Active ChatGPT connections and OAuth tokens are revoked when the request is accepted.",
    "Active ChatGPT connections, OAuth tokens, and Auth sessions are revoked by the durable deletion worker before access is disabled."
)
page_path.write_text(page)

# Register durable deletion verifier.
runner_path = Path("scripts/run-database-verification.mjs")
runner = runner_path.read_text()
runner = replace_once(
    runner,
    '  "supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql",',
    '  "supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql",\n  "supabase/verification/food-catalog-governance-control-plane-deletion-durability-rereview.sql",',
    "register deletion durability verifier"
)
runner_path.write_text(runner)

# Privacy verifier now proves identifying claim text is purgeable and absent globally.
privacy_path = Path("supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql")
privacy = privacy_path.read_text()
privacy = privacy.replace("'privacy:open'", "'person@example.test private claim'", 1)
needle = "  'member report payload was not persisted before deletion'\n);"
insert = needle + r'''
select pg_temp.plan6_report_privacy_assert(
  (select claim_text='person@example.test private claim' from public.food_catalog_correction_report_member_payloads where report_id=:'open_report'::uuid)
  and not exists(
    select 1 from public.food_catalog_correction_cases
    where id=:'open_case'::uuid and (claim_key ilike '%person@example.test%' or issue_key ilike '%person@example.test%')
  ),
  'durable global authority retained member-authored claim text'
);'''
privacy = replace_once(privacy, needle, insert, "pre-purge PII claim assertion")
needle2 = "  'canonical account purge left attributable correction-report member payload behind'\n);"
insert2 = needle2 + r'''
select pg_temp.plan6_report_privacy_assert(
  not exists(select 1 from public.food_catalog_correction_cases where claim_key ilike '%person@example.test%' or issue_key ilike '%person@example.test%')
  and not exists(select 1 from public.food_catalog_correction_events where reason ilike '%person@example.test%')
  and not exists(select 1 from public.food_catalog_governance_audit_events where to_jsonb(food_catalog_governance_audit_events)::text ilike '%person@example.test%')
  and not exists(select 1 from public.food_catalog_governance_outbox where to_jsonb(food_catalog_governance_outbox)::text ilike '%person@example.test%'),
  'durable global authority retained member-authored claim text after canonical purge'
);'''
privacy = replace_once(privacy, needle2, insert2, "post-purge global PII assertion")
privacy = privacy.replace("'privacy:stale'", "'person@example.test stale private claim'", 1)
old_stale_assert = r'''select pg_temp.plan6_report_privacy_assert(
  not exists(select 1 from public.food_catalog_correction_cases where issue_key=lower(:'food_id'||'|other|privacy:stale')),
  'stale deletion-processing report created global intake state'
);'''
new_stale_assert = r'''select pg_temp.plan6_report_privacy_assert(
  not exists(select 1 from public.food_catalog_correction_report_member_payloads where claim_text='person@example.test stale private claim')
  and not exists(select 1 from public.food_catalog_correction_cases where claim_key ilike '%person@example.test stale private claim%' or issue_key ilike '%person@example.test stale private claim%'),
  'stale deletion-processing report created global or personal intake state'
);'''
privacy = replace_once(privacy, old_stale_assert, new_stale_assert, "stale PII assertion")
privacy_path.write_text(privacy)

# Concurrency: begin transition must carry durable job authority; report/purge race uses identifying claim and checks no global leak.
concurrency_path = Path("scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs")
concurrency = concurrency_path.read_text()
old_begin = "  const deletion = startSql(serviceSql(`select public.food_catalog_begin_account_deletion('${OWNER_A_UID}')`), APP_DELETE_OWNER);"
new_begin = r'''  runSql(`insert into public.account_deletion_jobs(
    id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,created_at,updated_at
  ) values(
    '6d000000-0000-4000-8000-000000000550','${OWNER_A_UID}',
    'final-p1-owner-delete-subject','final-p1-owner-delete-idempotency','processing','disabling_access',1,clock_timestamp(),clock_timestamp()
  );`);
  const deletion = startSql(serviceSql(`select public.food_catalog_begin_account_deletion('${OWNER_A_UID}','6d000000-0000-4000-8000-000000000550')`), APP_DELETE_OWNER);'''
concurrency = replace_once(concurrency, old_begin, new_begin, "final-owner deletion concurrency durable job")
concurrency = concurrency.replace("'final-p1:report-race'", "'person@example.test private race claim'", 1)
old_metadata = "    where c.issue_key=lower('${REPORT_FOOD}|other|final-p1:report-race')`));"
new_metadata = "    where c.food_id='${REPORT_FOOD}' and c.category='other'`));"
concurrency = replace_once(concurrency, old_metadata, new_metadata, "report race metadata lookup")
metadata_line = "  if (metadata !== 1) throw new Error(`Report/purge race did not preserve exactly one non-personal report metadata row: ${metadata}`);"
leak_check = metadata_line + r'''
  const globalClaimLeaks = Number(runSql(`select count(*) from public.food_catalog_correction_cases
    where claim_key ilike '%person@example.test%' or issue_key ilike '%person@example.test%'`));
  if (globalClaimLeaks !== 0) throw new Error(`Report/purge race retained ${globalClaimLeaks} member claim leak(s) in durable Case identity.`);'''
concurrency = replace_once(concurrency, metadata_line, leak_check, "report race global claim leak")
concurrency = concurrency.replace("'final-p1:stale-report'", "'person@example.test stale private race claim'", 1)
concurrency_path.write_text(concurrency)

print("Applied Plan 6 P1-F4/F5 permanent source patches.")
