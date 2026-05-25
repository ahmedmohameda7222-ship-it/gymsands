"use client";

import { useEffect, useState } from "react";
import { Camera, Ruler, Scale, TrendingUp } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProgressEntryModal } from "@/components/progress/progress-entry-modal";
import { ProgressCharts } from "@/components/progress/progress-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getProgressEntries } from "@/services/database/repository";
import type { ProgressEntry } from "@/types";

export default function ProgressPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    getProgressEntries(user.id)
      .then(setEntries)
      .catch((error) =>
        toast({
          title: "Could not load progress",
          description: error instanceof Error ? error.message : "Please refresh and try again."
        })
      );
  }, [toast, user]);

  const latest = entries.at(-1);

  return (
    <>
      <PageHeading
        title="Progress"
        description="Track body weight, measurements, photos, consistency, and trends."
        action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Scale} label="Body weight" value={latest?.body_weight_kg ? `${latest.body_weight_kg} kg` : "No entry"} detail="Latest progress entry" progress={latest ? 65 : 0} />
        <MetricCard icon={Ruler} label="Waist" value={latest?.waist_cm ? `${latest.waist_cm} cm` : "No entry"} detail="Centimeters by default" progress={latest ? 55 : 0} />
        <MetricCard icon={TrendingUp} label="Consistency" value="4 / week" detail="Workout completion" progress={80} />
        <MetricCard icon={Camera} label="Photos" value="Private" detail="Stored in Supabase Storage" progress={50} />
      </div>
      <div className="mt-4">
        <ProgressCharts entries={entries} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Progress history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3">
              <p className="font-semibold">{entry.entry_date}</p>
              <p className="text-sm text-muted-foreground">
                {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"} | {entry.waist_cm ? `${entry.waist_cm} cm waist` : "No waist"}
              </p>
              {entry.notes ? <p className="mt-2 text-sm text-slate-600">{entry.notes}</p> : null}
            </div>
          ))}
          {!entries.length ? <p className="text-sm text-muted-foreground">No progress entries yet.</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
