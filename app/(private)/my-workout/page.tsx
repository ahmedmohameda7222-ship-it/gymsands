import { PageHeading } from "@/components/layout/page-heading";
import { GeneratedWorkoutDashboard } from "@/components/workouts/generated-workout-dashboard";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";

export default function MyWorkoutPage() {
  return (
    <>
      <PageHeading title="My Workout" description="Follow generated plans, edit your own created plans, and track workout progress." />
      <div className="mb-5 flex flex-wrap gap-2">
        <a href="#generated-plans" className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-blue-50">
          Generated Workout Plans
        </a>
        <a href="#created-plans" className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-blue-50">
          My Created Plans
        </a>
      </div>
      <div className="space-y-8">
        <section id="generated-plans" className="space-y-3 scroll-mt-24">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Generated Workout Plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI/system-generated plans from onboarding and template recommendations.</p>
          </div>
          <GeneratedWorkoutDashboard />
        </section>
        <section id="created-plans" className="space-y-3 scroll-mt-24">
          <div>
            <h2 className="text-xl font-bold text-slate-950">My Created Plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">Plans you build manually, with saved workout days opening in the dedicated editor.</p>
          </div>
          <WorkoutPlanBuilder />
        </section>
      </div>
    </>
  );
}
