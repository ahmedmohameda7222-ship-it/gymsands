import type { ExerciseVideo, Workout } from "@/types";

export const defaultExerciseInstructions =
  "Warm up first, keep each rep controlled, use a pain-free range of motion, and stop if you feel sharp or serious pain.";

export const sampleWorkouts: Workout[] = [
  {
    id: "workout-barbell-back-squat",
    name: "Barbell Back Squat",
    category: "Strength",
    target_muscle: "Quads",
    equipment: "Barbell",
    difficulty: "Intermediate",
    sets: 4,
    reps: "6-10",
    rest_seconds: 120,
    instructions:
      "Set the bar across your upper back, brace your core, sit between your hips, keep knees tracking over toes, then drive through the floor to stand tall.",
    notes: "Use safety pins and start light.",
    is_global: true
  },
  {
    id: "workout-dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    category: "Strength",
    target_muscle: "Chest",
    equipment: "Dumbbell",
    difficulty: "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 90,
    instructions:
      "Lie flat on a bench, keep feet planted, lower the dumbbells with control, pause near chest level, then press up without locking aggressively.",
    notes: "Keep shoulders down and back.",
    is_global: true
  },
  {
    id: "workout-seated-cable-row",
    name: "Seated Cable Row",
    category: "Strength",
    target_muscle: "Middle Back",
    equipment: "Cable",
    difficulty: "Beginner",
    sets: 3,
    reps: "10-12",
    rest_seconds: 75,
    instructions:
      "Sit tall, brace your core, pull the handle toward your lower ribs, squeeze shoulder blades gently, then return with control.",
    notes: "Avoid leaning back to finish reps.",
    is_global: true
  },
  {
    id: "workout-lat-pull-down",
    name: "Lat Pull Down",
    category: "Strength",
    target_muscle: "Lats",
    equipment: "Cable",
    difficulty: "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions:
      "Hold the bar slightly wider than shoulders, keep chest tall, pull elbows down toward ribs, then return slowly to the top.",
    notes: "Do not pull behind the neck.",
    is_global: true
  },
  {
    id: "workout-standing-dumbbell-press",
    name: "Standing Dumbbell Shoulder Press",
    category: "Strength",
    target_muscle: "Shoulders",
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    sets: 3,
    reps: "8-10",
    rest_seconds: 90,
    instructions:
      "Stand tall with ribs down, start dumbbells near shoulders, press overhead in a smooth path, then lower under control.",
    notes: "Avoid over-arching your lower back.",
    is_global: true
  },
  {
    id: "workout-plank",
    name: "Plank",
    category: "Core",
    target_muscle: "Abs",
    equipment: "Bodyweight",
    difficulty: "Beginner",
    sets: 3,
    reps: "30-60 seconds",
    rest_seconds: 60,
    instructions:
      "Place elbows under shoulders, keep a straight line from head to heels, squeeze glutes lightly, and breathe steadily.",
    notes: "Stop before your hips sag.",
    is_global: true
  },
  {
    id: "workout-romanian-deadlift",
    name: "Romanian Deadlift",
    category: "Strength",
    target_muscle: "Hamstrings",
    equipment: "Barbell",
    difficulty: "Intermediate",
    sets: 3,
    reps: "8-10",
    rest_seconds: 120,
    instructions:
      "Brace, push hips back, keep the bar close to your legs, lower until hamstrings stretch, then drive hips forward to stand.",
    notes: "Keep your spine neutral.",
    is_global: true
  },
  {
    id: "workout-cable-crunch",
    name: "Cable Crunch",
    category: "Core",
    target_muscle: "Abs",
    equipment: "Cable",
    difficulty: "Beginner",
    sets: 3,
    reps: "10-15",
    rest_seconds: 60,
    instructions:
      "Kneel facing the cable, hold the rope near your temples, curl ribs toward hips, pause, then return slowly.",
    notes: "Move through your spine, not your hips only.",
    is_global: true
  }
];

export const sampleExerciseVideos: ExerciseVideo[] = [
  {
    id: "video-barbell-back-squat",
    exercise_name: "Barbell Back Squat",
    category_type: "Muscle Group",
    category: "Quads",
    exercise_url: "",
    video_url: null,
    instructions: sampleWorkouts[0].instructions,
    source: "manual_sample",
    is_global: true
  },
  {
    id: "video-dumbbell-bench-press",
    exercise_name: "Dumbbell Bench Press",
    category_type: "Muscle Group",
    category: "Chest",
    exercise_url: "",
    video_url: null,
    instructions: sampleWorkouts[1].instructions,
    source: "manual_sample",
    is_global: true
  },
  {
    id: "video-seated-cable-row",
    exercise_name: "Seated Cable Row",
    category_type: "Muscle Group",
    category: "Middle Back",
    exercise_url: "",
    video_url: null,
    instructions: sampleWorkouts[2].instructions,
    source: "manual_sample",
    is_global: true
  },
  {
    id: "video-lat-pull-down",
    exercise_name: "Lat Pull Down",
    category_type: "Muscle Group",
    category: "Lats",
    exercise_url: "",
    video_url: null,
    instructions: sampleWorkouts[3].instructions,
    source: "manual_sample",
    is_global: true
  },
  {
    id: "video-plank",
    exercise_name: "Plank",
    category_type: "Muscle Group",
    category: "Abs",
    exercise_url: "",
    video_url: null,
    instructions: sampleWorkouts[5].instructions,
    source: "manual_sample",
    is_global: true
  }
];
