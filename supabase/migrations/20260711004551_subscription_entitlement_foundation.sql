-- Provider-neutral entitlement foundation. This migration seeds no offering,
-- price, paid capability, or checkout and performs no provider-side action.

create table if not exists public.billing_offerings (
  id uuid primary key default gen_random_uuid(),
  offering_key text not null unique,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_product_id text,
  provider_price_id text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  capability_keys text[] not null default '{}'::text[],
  owner_approved_at timestamptz,
  owner_approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_offerings_approval_check check (
    status <> 'approved'
    or (owner_approved_at is not null and provider_product_id is not null and provider_price_id is not null and cardinality(capability_keys) > 0)
  ),
  unique (id, provider)
);

create unique index if not exists billing_offerings_provider_price_idx
  on public.billing_offerings (provider, provider_price_id)
  where provider_price_id is not null;

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_customer_id text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_customer_id),
  unique (id, provider)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_customer_id uuid,
  offering_id uuid,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_subscription_id text not null,
  provider_status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  grace_period_end timestamptz,
  cancelled_at timestamptz,
  ended_at timestamptz,
  latest_provider_event_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  foreign key (billing_customer_id, provider) references public.billing_customers(id, provider) on delete set null (billing_customer_id),
  foreign key (offering_id, provider) references public.billing_offerings(id, provider) on delete restrict
);

create index if not exists billing_subscriptions_user_state_idx
  on public.billing_subscriptions (user_id, provider_status, current_period_end desc);
create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (billing_customer_id);
create index if not exists billing_subscriptions_offering_idx
  on public.billing_subscriptions (offering_id);

create table if not exists public.billing_event_ledger (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  provider_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'retryable_error', 'terminal_error')),
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  last_error_code text,
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  unique (provider, provider_event_id)
);

create index if not exists billing_event_ledger_retry_idx
  on public.billing_event_ledger (processing_status, received_at)
  where processing_status in ('received', 'retryable_error');
create index if not exists billing_event_ledger_user_idx
  on public.billing_event_ledger (user_id, received_at desc)
  where user_id is not null;
create index if not exists billing_event_ledger_subscription_idx
  on public.billing_event_ledger (subscription_id)
  where subscription_id is not null;

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_key text not null,
  state text not null default 'inactive'
    check (state in ('inactive', 'trialing', 'active', 'grace_period', 'billing_issue', 'cancelled_but_active', 'expired', 'revoked')),
  source_provider text check (source_provider in ('stripe', 'apple', 'google', 'manual')),
  source_subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  valid_from timestamptz,
  valid_through timestamptz,
  grace_period_end timestamptz,
  revoked_at timestamptz,
  reason_code text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, capability_key)
);

create index if not exists user_entitlements_user_state_idx
  on public.user_entitlements (user_id, state, valid_through desc);
create index if not exists user_entitlements_subscription_idx
  on public.user_entitlements (source_subscription_id)
  where source_subscription_id is not null;

alter table public.billing_offerings enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_event_ledger enable row level security;
alter table public.user_entitlements enable row level security;

revoke all on table public.billing_offerings, public.billing_customers, public.billing_subscriptions, public.billing_event_ledger, public.user_entitlements
  from public, anon, authenticated;
grant all on table public.billing_offerings, public.billing_customers, public.billing_subscriptions, public.billing_event_ledger, public.user_entitlements
  to service_role;
grant usage, select on sequence public.billing_event_ledger_id_seq to service_role;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
  on public.user_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.user_entitlements to authenticated;

drop trigger if exists billing_offerings_updated_at on public.billing_offerings;
create trigger billing_offerings_updated_at
before update on public.billing_offerings
for each row execute function public.set_updated_at();

drop trigger if exists billing_customers_updated_at on public.billing_customers;
create trigger billing_customers_updated_at
before update on public.billing_customers
for each row execute function public.set_updated_at();

drop trigger if exists billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists user_entitlements_updated_at on public.user_entitlements;
create trigger user_entitlements_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

comment on table public.billing_offerings is
  'Owner-gated provider mappings and capabilities. The launch migration intentionally creates no approved offering or price.';
comment on table public.billing_event_ledger is
  'Service-only idempotent billing event ledger. Stores event metadata and a payload hash, not raw payment credentials or provider payloads.';
comment on table public.user_entitlements is
  'Provider-neutral capability state. Application authorization reads this boundary rather than raw Stripe, StoreKit, or Play state.';
