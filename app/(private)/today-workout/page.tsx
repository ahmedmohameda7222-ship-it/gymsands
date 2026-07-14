import { redirect } from "next/navigation";

// next.config.mjs handles this alias before React renders. Keep the route-level
// fallback for environments that bypass Next redirect configuration.
export default function TodayWorkoutPage() {
  redirect("/my-workout/plans");
}
