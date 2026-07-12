import { describe, expect, it } from "vitest";
import { buildAiActionSummary, buildChatGptActionPrompt } from "@/components/ai/ai-action-summary";

const context = {
  workout_day: { id: "private-day-id", name: "Push Day" },
  active_exercise: { id: "private-exercise-id", exercise_name: "Bench Press" },
  replacement_reason: "pain_or_discomfort"
};

describe("ChatGPT action presentation", () => {
  it("builds a short human summary without internal fields", () => {
    expect(buildAiActionSummary("replace_exercise", context)).toEqual([
      { label: "Workout", value: "Push Day" },
      { label: "Exercise", value: "Bench Press" },
      { label: "Reason", value: "Pain Or Discomfort" },
      { label: "Goal", value: "Replace this exercise" }
    ]);
  });

  it("asks ChatGPT to use authorized Plaivra context and confirmed tools", () => {
    const prompt = buildChatGptActionPrompt(
      "replace_exercise",
      context,
      "Keep the movement shoulder friendly."
    );
    const lines = prompt.split("\n");

    expect(prompt).toContain("Connect to my Plaivra account");
    expect(prompt).toContain("minimum authorized workouts context");
    expect(lines).toContain("Context:");
    expect(lines).toContain("- Workout: Push Day");
    expect(lines).toContain("- Exercise: Bench Press");
    expect(lines).toContain("Additional instruction: Keep the movement shoulder friendly.");
    expect(prompt).toContain("Plaivra tools");
    expect(prompt).toContain("do not claim success until the tool confirms it");
    expect(prompt).not.toContain("\\n");
    expect(prompt).not.toContain("private-day-id");
    expect(prompt).not.toContain("private-exercise-id");
    expect(prompt).not.toContain("context_json");
    expect(prompt).not.toContain("{");
  });

  it("includes meal and date context in both the summary and copied prompt", () => {
    const mealContext = {
      meal_item: { id: "internal-meal-id", food_name: "Chicken rice bowl", meal_type: "Lunch", plan_date: "2026-07-12" },
      date: "2026-07-12",
      saved_macros: { calories: 620, protein_g: 48 }
    };
    const summary = buildAiActionSummary("regenerate_meal", mealContext);
    const prompt = buildChatGptActionPrompt("regenerate_meal", mealContext);

    expect(summary).toContainEqual({ label: "Meal", value: "Chicken rice bowl" });
    expect(summary).toContainEqual({ label: "Date", value: "2026-07-12" });
    expect(prompt).toContain("- Meal: Chicken rice bowl");
    expect(prompt).toContain("- Date: 2026-07-12");
    expect(prompt).not.toContain("internal-meal-id");
    expect(prompt).toContain("do not save anything until I explicitly confirm");
  });

  it("includes the grocery week and concise list context without dumping raw objects", () => {
    const groceryContext = {
      week_start: "2026-07-06",
      week_end: "2026-07-12",
      grocery_items: [
        { id: "private-1", item_name: "Chicken breast", checked: false },
        { id: "private-2", item_name: "Rice", checked: true }
      ],
      meal_plan_items: [{ id: "private-meal", food_name: "Chicken bowl" }]
    };
    const summary = buildAiActionSummary("build_grocery_list", groceryContext);
    const prompt = buildChatGptActionPrompt("build_grocery_list", groceryContext);

    expect(summary).toContainEqual({ label: "Grocery week", value: "2026-07-06 to 2026-07-12" });
    expect(prompt).toContain("- Current grocery items: Chicken breast, Rice");
    expect(prompt).toContain("- Planned meals: Chicken bowl");
    expect(prompt).not.toContain("private-1");
    expect(prompt).not.toContain('"checked"');
    expect(prompt).not.toContain("{");
  });

  it("keeps read-only action instructions non-mutating", () => {
    const prompt = buildChatGptActionPrompt("review_workout_session", context);
    expect(prompt).toContain("do not change any Plaivra data");
    expect(prompt).not.toContain("use the appropriate Plaivra tools and do not claim success");
  });
});
