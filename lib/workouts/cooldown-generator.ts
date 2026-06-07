import type { PlanBlock } from "@/lib/workouts/generator-rules";

function stretchesForFocus(focus: string) {
  const lower = focus.toLowerCase();
  if (lower.includes("push")) return ["Chest stretch", "Shoulder stretch", "Triceps stretch"];
  if (lower.includes("pull")) return ["Lat stretch", "Rear delt stretch", "Biceps and forearm stretch"];
  if (lower.includes("leg") || lower.includes("lower")) return ["Hamstring stretch", "Quad stretch", "Hip flexor stretch", "Calf stretch"];
  return ["Child's pose breathing", "Lat stretch", "Hamstring stretch"];
}

export function generateCooldownBlock(focus: string): PlanBlock {
  return {
    blockType: "cooldown",
    title: `${focus} cool-down`,
    instructions: "Lower your heart rate gradually and use simple, relaxed static stretches.",
    durationMinutes: 7,
    sortOrder: 4,
    items: [
      {
        name: "Slow walk or easy bike",
        durationSeconds: 180,
        intensity: "easy",
        notes: "Let breathing settle.",
        sortOrder: 1
      },
      ...stretchesForFocus(focus).map((name, index) => ({
        name,
        durationSeconds: 60,
        intensity: "gentle stretch",
        notes: "30 seconds each side where applicable.",
        sortOrder: index + 2
      }))
    ]
  };
}
