do $$
declare
  definition text;
  required_value text;
begin
  select pg_get_constraintdef(c.oid)
    into definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'user_exercise_alternatives'
    and c.conname = 'user_exercise_alternatives_reason_check';

  if definition is null then
    raise exception 'Missing user_exercise_alternatives_reason_check';
  end if;

  foreach required_value in array array[
    'machine_taken',
    'no_equipment',
    'pain_or_discomfort',
    'too_hard',
    'home_alternative',
    'same_muscle',
    'lower_back_friendly',
    'knee_friendly',
    'shoulder_friendly',
    'other',
    'want_harder',
    'pain_discomfort',
    'no_spotter',
    'technique_confidence',
    'variation'
  ]
  loop
    if position(quote_literal(required_value) in definition) = 0 then
      raise exception 'Replacement reason constraint is missing %', required_value;
    end if;
  end loop;
end
$$;
