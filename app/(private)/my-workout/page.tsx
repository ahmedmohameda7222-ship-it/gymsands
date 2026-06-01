import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MyWorkoutPage() {
  return (
    <>
      <PageHeading title="Workout Plans" description="Choose generated workout plans or the plans you created yourself." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Generated Plans</h2>
                <p className="text-sm text-muted-foreground">Plans selected from onboarding and the workout template library.</p>
              </div>
            </div>
            <Button asChild>
              <Link href="/my-workout/generated">Open Generated Plans</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Workout Plans</h2>
                <p className="text-sm text-muted-foreground">Create, open, edit, and start your own saved workout plans.</p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/my-workout/plans">Open Workout Plans</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
