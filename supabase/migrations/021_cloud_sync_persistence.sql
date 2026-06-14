-- Migration 021: Cloud Sync Persistence

-- 1. Custom Exercises
CREATE TABLE IF NOT EXISTS public.user_custom_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  target_muscle text,
  equipment text,
  difficulty text,
  sets integer,
  reps text,
  rest_seconds integer,
  instructions text,
  notes text,
  muscle_category text,
  equipment_required text,
  mechanics text,
  force_type text,
  experience_level text,
  secondary_muscles text[],
  exercise_url text,
  video_url text,
  custom_video_url text,
  is_global boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_custom_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own custom exercises"
  ON public.user_custom_exercises
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Exercise Favorites
CREATE TABLE IF NOT EXISTS public.user_exercise_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

ALTER TABLE public.user_exercise_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exercise favorites"
  ON public.user_exercise_favorites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Meal Templates
CREATE TABLE IF NOT EXISTS public.meal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own meal templates"
  ON public.meal_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Meal Template Items
CREATE TABLE IF NOT EXISTS public.meal_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.meal_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_name text NOT NULL,
  meal_type text NOT NULL,
  serving_size text,
  quantity numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.meal_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own meal template items"
  ON public.meal_template_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Batch Meals
CREATE TABLE IF NOT EXISTS public.batch_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  portions integer NOT NULL DEFAULT 1,
  serving_size text,
  notes text,
  total_calories numeric DEFAULT 0,
  total_protein_g numeric DEFAULT 0,
  total_carbs_g numeric DEFAULT 0,
  total_fat_g numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.batch_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own batch meals"
  ON public.batch_meals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Shopping Checks
CREATE TABLE IF NOT EXISTS public.user_shopping_checks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  item_key text NOT NULL,
  checked boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, week_start, item_key)
);

ALTER TABLE public.user_shopping_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own shopping checks"
  ON public.user_shopping_checks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
