alter table public.exercises
  alter column is_approved set default true;

update public.exercises
set is_approved = true
where is_global = true
  and is_approved = false;

update public.exercise_import_batches
set approved_count = imported_count
where source = 'wger'
  and status = 'completed'
  and coalesce(approved_count, 0) = 0
  and coalesce(rejected_count, 0) = 0;
