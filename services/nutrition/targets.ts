export type SavedTargets = {
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
};

export const targetSetupDefaults: SavedTargets = {
  daily_calories: 2200,
  protein_g: 150,
  carbs_g: 250,
  fat_g: 70,
  water_ml: 2500
};

export function normalizeSavedTargets(value: Partial<SavedTargets> | null | undefined): SavedTargets | null {
  if (!value) return null;
  const dailyCalories = positiveNumber(value.daily_calories);
  const protein = nonNegativeNumber(value.protein_g);
  const carbs = nonNegativeNumber(value.carbs_g);
  const fat = nonNegativeNumber(value.fat_g);
  const water = positiveNumber(value.water_ml);

  if (!dailyCalories && !protein && !carbs && !fat && !water) return null;

  return {
    daily_calories: dailyCalories || targetSetupDefaults.daily_calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    water_ml: water || targetSetupDefaults.water_ml
  };
}

export function targetOrSetupDefault(value: SavedTargets | null): SavedTargets {
  return value ?? targetSetupDefaults;
}

export function estimateTdee({
  age,
  sex,
  heightCm,
  weightKg,
  activityLevel,
  goal
}: {
  age: number;
  sex: "female" | "male";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "very_active";
  goal: "fat_loss" | "maintenance" | "muscle_gain" | "recomposition";
}) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const multiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725
  }[activityLevel];
  const maintenance = Math.round(base * multiplier);
  const goalAdjustment = {
    fat_loss: -400,
    maintenance: 0,
    muscle_gain: 250,
    recomposition: -150
  }[goal];
  const dailyCalories = Math.max(1200, maintenance + goalAdjustment);
  const protein = Math.round(weightKg * (goal === "muscle_gain" || goal === "recomposition" ? 2 : 1.8));
  const fat = Math.round((dailyCalories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((dailyCalories - protein * 4 - fat * 9) / 4));

  return {
    maintenance_calories: maintenance,
    daily_calories: dailyCalories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    water_ml: Math.round(Math.max(2000, weightKg * 35))
  } satisfies SavedTargets & { maintenance_calories: number };
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
