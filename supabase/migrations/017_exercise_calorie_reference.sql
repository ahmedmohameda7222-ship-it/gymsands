create table if not exists public.exercise_calorie_reference (
  id uuid primary key default gen_random_uuid(),
  activity_key text not null unique,
  display_name text not null,
  category text,
  default_intensity text,
  met numeric(5,2) not null check (met > 0),
  aliases text[] not null default '{}',
  source_note text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_exercise_calorie_reference_active on public.exercise_calorie_reference(is_active, display_name);

alter table public.exercise_calorie_reference enable row level security;

grant select on public.exercise_calorie_reference to authenticated;
grant all on public.exercise_calorie_reference to authenticated;

drop policy if exists "exercise_calorie_reference_read" on public.exercise_calorie_reference;
create policy "exercise_calorie_reference_read" on public.exercise_calorie_reference
for select using (auth.role() = 'authenticated' and is_active = true);

drop policy if exists "exercise_calorie_reference_admin_all" on public.exercise_calorie_reference;
create policy "exercise_calorie_reference_admin_all" on public.exercise_calorie_reference
for all using (public.is_admin()) with check (public.is_admin());

insert into public.exercise_calorie_reference (activity_key, display_name, category, default_intensity, met, aliases, source_note)
values
  ('walking_easy', 'Walking', 'Cardio', 'Easy', 3.00, array['walk','walking','steps'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('walking_brisk', 'Brisk walking', 'Cardio', 'Moderate', 4.30, array['brisk walk','fast walk','power walk'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('running_easy', 'Running', 'Cardio', 'Moderate', 8.30, array['run','running','jog','jogging'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('running_fast', 'Fast running', 'Cardio', 'Hard', 11.50, array['sprint','sprinting','fast run'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('cycling_easy', 'Cycling', 'Cardio', 'Moderate', 6.80, array['bike','biking','cycle','cycling'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('cycling_hard', 'Hard cycling', 'Cardio', 'Hard', 10.00, array['hard bike','hard cycling','spin bike'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('elliptical', 'Elliptical trainer', 'Cardio', 'Moderate', 5.00, array['elliptical','cross trainer'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('rowing', 'Rowing machine', 'Cardio', 'Moderate', 7.00, array['row','rowing','rower'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('swimming', 'Swimming', 'Cardio', 'Moderate', 6.00, array['swim','swimming'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('jump_rope', 'Jump rope', 'Cardio', 'Hard', 11.00, array['jump rope','skipping rope','skipping'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('stair_climber', 'Stair climber', 'Cardio', 'Hard', 8.80, array['stairs','stairmaster','stair climber'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('hiit', 'HIIT', 'Conditioning', 'Hard', 8.00, array['hiit','intervals','interval training'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('strength_training', 'Strength training', 'Strength', 'Moderate', 5.00, array['weights','lifting','weight lifting','strength workout','gym workout'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('bodyweight_training', 'Bodyweight training', 'Strength', 'Moderate', 4.00, array['calisthenics','bodyweight','pushups','pullups'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('yoga', 'Yoga', 'Mobility', 'Easy', 2.50, array['yoga','stretch yoga'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('pilates', 'Pilates', 'Mobility', 'Easy', 3.00, array['pilates'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('stretching', 'Stretching', 'Mobility', 'Easy', 2.30, array['stretch','stretching','mobility'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('football', 'Football / soccer', 'Sport', 'Hard', 7.00, array['football','soccer'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('basketball', 'Basketball', 'Sport', 'Hard', 6.50, array['basketball'], 'Compendium-style MET estimate for general fitness tracking.'),
  ('tennis', 'Tennis', 'Sport', 'Moderate', 7.30, array['tennis'], 'Compendium-style MET estimate for general fitness tracking.')
on conflict (activity_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    default_intensity = excluded.default_intensity,
    met = excluded.met,
    aliases = excluded.aliases,
    source_note = excluded.source_note,
    is_active = true,
    updated_at = now();
