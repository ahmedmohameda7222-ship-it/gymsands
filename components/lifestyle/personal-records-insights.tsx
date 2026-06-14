"use client";

import { useEffect, useMemo, useState } from "react";
import { Dumbbell, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { getPersonalRecords } from "@/services/database/repository";
import type { PersonalRecord } from "@/types";

export function PersonalRecordsInsights() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<PersonalRecord[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    getPersonalRecords(user.id)
      .then(setRecords)
      .catch((error) => toast({ title: "Could not load record insights", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  const insights = useMemo(() => buildRecordInsights(records), [records]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <InsightCard icon={Trophy} label="Record entries" value={records.length ? String(records.length) : "No records"} detail={records.length ? "Saved real exercise records" : "Save your first record below."} />
      <InsightCard icon={Dumbbell} label="Best max weight" value={insights.bestWeight ? `${insights.bestWeight.weight_kg} kg` : "No data"} detail={insights.bestWeight ? `${insights.bestWeight.exercise_name} on ${insights.bestWeight.record_date}` : "Add a max-weight record."} />
      <InsightCard icon={TrendingUp} label="Best est. 1RM" value={insights.bestOneRepMax ? `${insights.bestOneRepMax.estimate} kg` : "No data"} detail={insights.bestOneRepMax ? `${insights.bestOneRepMax.exercise_name} from ${insights.bestOneRepMax.weight_kg}kg x ${insights.bestOneRepMax.reps}` : "Requires weight and reps."} />
    </div>
  );
}

function InsightCard({ icon: Icon, label, value, detail }: { icon: typeof Trophy; label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function buildRecordInsights(records: PersonalRecord[]) {
  const weighted = records.filter((record) => typeof record.weight_kg === "number") as Array<PersonalRecord & { weight_kg: number }>;
  const bestWeight = weighted.sort((a, b) => b.weight_kg - a.weight_kg)[0] ?? null;
  const bestOneRepMax = weighted
    .filter((record): record is PersonalRecord & { weight_kg: number; reps: number } => typeof record.reps === "number" && record.reps > 0)
    .map((record) => ({ ...record, estimate: estimateOneRepMax(record.weight_kg, record.reps) }))
    .sort((a, b) => b.estimate - a.estimate)[0] ?? null;
  return { bestWeight, bestOneRepMax };
}

function estimateOneRepMax(weightKg: number, reps: number) {
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}
