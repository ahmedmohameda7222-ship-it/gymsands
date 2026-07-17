begin;

create table public.exercise_localizations (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  locale text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_localizations_locale_check check (locale in ('en', 'de', 'ar')),
  constraint exercise_localizations_name_check check (btrim(name) <> ''),
  constraint exercise_localizations_pkey primary key (exercise_id, locale)
);

create table public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  locale text not null,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null,
  searchable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_aliases_locale_check check (locale in ('en', 'de', 'ar')),
  constraint exercise_aliases_alias_check check (btrim(alias) <> ''),
  constraint exercise_aliases_normalized_check check (
    normalized_alias = lower(regexp_replace(btrim(normalize(alias, NFKC)), '\s+', ' ', 'g'))
    and btrim(normalized_alias) <> ''
  ),
  constraint exercise_aliases_type_check check (alias_type in ('common_name', 'english_gym_term')),
  constraint exercise_aliases_locale_normalized_key unique (locale, normalized_alias)
);

create table public.exercise_relationships (
  id uuid primary key,
  source_exercise_id uuid not null references public.exercises(id) on delete cascade,
  target_exercise_id uuid not null references public.exercises(id) on delete cascade,
  relationship_type text not null,
  rationale text not null,
  prescription_transfer text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint exercise_relationships_distinct_check check (source_exercise_id <> target_exercise_id),
  constraint exercise_relationships_type_check check (
    relationship_type in ('variation', 'alternative', 'progression', 'regression')
  ),
  constraint exercise_relationships_rationale_check check (btrim(rationale) <> ''),
  constraint exercise_relationships_transfer_check check (prescription_transfer in ('full', 'partial', 'none')),
  constraint exercise_relationships_sort_check check (sort_order > 0),
  constraint exercise_relationships_edge_key unique (source_exercise_id, relationship_type, target_exercise_id),
  constraint exercise_relationships_sort_key unique (sort_order)
);

create table public.exercise_research_sources (
  source_key text primary key,
  pmid text,
  doi text,
  evidence_type text not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_research_sources_key_check check (source_key ~ '^[a-z0-9_]+$'),
  constraint exercise_research_sources_type_check check (btrim(evidence_type) <> ''),
  constraint exercise_research_sources_note_check check (btrim(note) <> '')
);

create table public.exercise_mapping_evidence (
  mapping_set_id uuid not null references public.exercise_muscle_mapping_sets(id) on delete cascade,
  source_key text not null references public.exercise_research_sources(source_key) on delete restrict,
  research_limitations text[] not null default '{}',
  registry_version text not null,
  created_at timestamptz not null default now(),
  constraint exercise_mapping_evidence_registry_check check (registry_version = 'plaivra_curated_exercises_v1'),
  constraint exercise_mapping_evidence_pkey primary key (mapping_set_id, source_key)
);

create table public.exercise_mapping_reviews (
  mapping_set_id uuid primary key references public.exercise_muscle_mapping_sets(id) on delete cascade,
  review_status text not null,
  review_rationale text not null,
  registry_version text not null,
  evidence_snapshot_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_mapping_reviews_status_check check (review_status = 'approved_for_initial_v1'),
  constraint exercise_mapping_reviews_rationale_check check (btrim(review_rationale) <> ''),
  constraint exercise_mapping_reviews_registry_check check (registry_version = 'plaivra_curated_exercises_v1')
);

create index exercise_localizations_locale_name_idx on public.exercise_localizations(locale, name);
create index exercise_aliases_exercise_idx on public.exercise_aliases(exercise_id);
create index exercise_relationships_source_idx on public.exercise_relationships(source_exercise_id, relationship_type);
create index exercise_relationships_target_idx on public.exercise_relationships(target_exercise_id, relationship_type);
create index exercise_mapping_evidence_source_idx on public.exercise_mapping_evidence(source_key);

create trigger exercise_localizations_updated_at
before update on public.exercise_localizations
for each row execute function public.set_updated_at();
create trigger exercise_aliases_updated_at
before update on public.exercise_aliases
for each row execute function public.set_updated_at();
create trigger exercise_research_sources_updated_at
before update on public.exercise_research_sources
for each row execute function public.set_updated_at();
create trigger exercise_mapping_reviews_updated_at
before update on public.exercise_mapping_reviews
for each row execute function public.set_updated_at();

alter table public.exercise_localizations enable row level security;
alter table public.exercise_aliases enable row level security;
alter table public.exercise_relationships enable row level security;
alter table public.exercise_research_sources enable row level security;
alter table public.exercise_mapping_evidence enable row level security;
alter table public.exercise_mapping_reviews enable row level security;

revoke all on table public.exercise_localizations from public, anon, authenticated;
revoke all on table public.exercise_aliases from public, anon, authenticated;
revoke all on table public.exercise_relationships from public, anon, authenticated;
revoke all on table public.exercise_research_sources from public, anon, authenticated;
revoke all on table public.exercise_mapping_evidence from public, anon, authenticated;
revoke all on table public.exercise_mapping_reviews from public, anon, authenticated;

grant select, insert, update, delete on table public.exercise_localizations to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_aliases to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_relationships to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_research_sources to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_mapping_evidence to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_mapping_reviews to authenticated, service_role;

create policy exercise_localizations_member_select
on public.exercise_localizations for select to authenticated
using (exists (
  select 1 from public.exercises exercise
  where exercise.id = exercise_localizations.exercise_id
    and exercise.is_global and exercise.is_approved
));
create policy exercise_localizations_admin_write
on public.exercise_localizations for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy exercise_aliases_member_select
on public.exercise_aliases for select to authenticated
using (searchable and exists (
  select 1 from public.exercises exercise
  where exercise.id = exercise_aliases.exercise_id
    and exercise.is_global and exercise.is_approved
));
create policy exercise_aliases_admin_write
on public.exercise_aliases for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy exercise_relationships_member_select
on public.exercise_relationships for select to authenticated
using (
  exists (select 1 from public.exercises exercise where exercise.id = source_exercise_id and exercise.is_global and exercise.is_approved)
  and exists (select 1 from public.exercises exercise where exercise.id = target_exercise_id and exercise.is_global and exercise.is_approved)
);
create policy exercise_relationships_admin_write
on public.exercise_relationships for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy exercise_research_sources_admin_all
on public.exercise_research_sources for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy exercise_mapping_evidence_admin_all
on public.exercise_mapping_evidence for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy exercise_mapping_reviews_admin_all
on public.exercise_mapping_reviews for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

comment on table public.exercise_localizations is 'Approved EN, DE, and AR canonical names for curated global exercises.';
comment on table public.exercise_aliases is 'Controlled searchable aliases with locale-scoped normalized collision protection.';
comment on table public.exercise_relationships is 'Reviewed directed exercise relationships; inverse navigation is derived by services.';
comment on table public.exercise_mapping_reviews is 'Internal mapping review rationale; member access is denied by RLS.';

commit;
