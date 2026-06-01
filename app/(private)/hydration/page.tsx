import Link from "next/link";
import { Droplets } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HydrationPage() {
  return (
    <>
      <PageHeading title="Hydration" description="Water tracking is connected to the calorie tracker and daily wellness habits." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" />
            Hydration Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Log water from the Calorie Tracker, then add water habits or tasks for daily follow-through.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/calories">Open Calorie Tracker</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/habits">Open Habits</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
