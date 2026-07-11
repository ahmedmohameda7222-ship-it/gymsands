import { NextResponse } from "next/server";
import { jsonError, requireEligibleUser } from "@/lib/integrations/env";

export async function POST(request: Request) {
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const planExerciseId = String(body.planExerciseId ?? "").trim();
  if (!planExerciseId) return jsonError("planExerciseId is required.");

  const current = await context.supabase
    .from("user_workout_plan_exercises")
    .select("id,plan_day_id,category,target_muscle,equipment,sort_order,user_workout_plan_days(plan_id,user_workout_plans(user_id))")
    .eq("id", planExerciseId)
    .maybeSingle();
  if (current.error) return jsonError(current.error.message, 400);
  if (!current.data) return jsonError("Plan exercise was not found.", 404);

  const relation = current.data.user_workout_plan_days as any;
  const ownerId = Array.isArray(relation?.user_workout_plans) ? relation.user_workout_plans[0]?.user_id : relation?.user_workout_plans?.user_id;
  if (ownerId !== context.user.id) return jsonError("You can only replace exercises in your own plans.", 403);

  const equipment = String(current.data.equipment ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  let requestQuery = context.supabase
    .from("exercises")
    .select("id,name,primary_muscle,equipment,difficulty,instructions")
    .eq("is_global", true)
    .neq("name", body.currentName ?? "");

  if (current.data.target_muscle) requestQuery = requestQuery.ilike("primary_muscle", `%${current.data.target_muscle}%`);
  const { data: candidates, error } = await requestQuery.limit(25);
  if (error) return jsonError(error.message, 400);

  const replacement = (candidates ?? []).find((candidate: any) => {
    if (!equipment.length) return true;
    const candidateEquipment = (candidate.equipment ?? []).join(" ").toLowerCase();
    return equipment.some((item) => candidateEquipment.includes(item.toLowerCase()));
  }) ?? candidates?.[0];

  if (!replacement) return jsonError("No active replacement exercise matched that muscle and equipment.", 404);

  const update = await context.supabase
    .from("user_workout_plan_exercises")
    .update({
      source_workout_id: replacement.id,
      exercise_name: replacement.name,
      target_muscle: replacement.primary_muscle ?? current.data.target_muscle,
      equipment: (replacement.equipment ?? []).join(", ") || current.data.equipment,
      instructions: replacement.instructions ?? null,
      notes: `Replacement from active exercise library`
    })
    .eq("id", planExerciseId);
  if (update.error) return jsonError(update.error.message, 400);

  return NextResponse.json({ replacement });
}
