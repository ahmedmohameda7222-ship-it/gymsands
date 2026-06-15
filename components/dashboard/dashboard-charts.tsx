"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardCharts({ macros }: { macros: { protein_g: number; carbs_g: number; fat_g: number } }) {
  const macroData = [
    { name: "Protein", value: macros.protein_g, color: "#2D3A1E" },
    { name: "Carbs", value: macros.carbs_g, color: "#C49A3B" },
    { name: "Fat", value: macros.fat_g, color: "#6B6B6B" }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
      <Card>
        <CardHeader>
          <CardTitle>Macro split</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={macroData} dataKey="value" innerRadius={52} outerRadius={82} paddingAngle={3}>
                {macroData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logged macro totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {macroData.map((entry) => (
            <div key={entry.name} className="rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{entry.name}</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color: entry.color }}>{entry.value}g</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
