"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const weeklyActivity = [
  { day: "Mon", workouts: 1, calories: 2100 },
  { day: "Tue", workouts: 0, calories: 1980 },
  { day: "Wed", workouts: 1, calories: 2240 },
  { day: "Thu", workouts: 1, calories: 2050 },
  { day: "Fri", workouts: 0, calories: 2300 },
  { day: "Sat", workouts: 1, calories: 2180 },
  { day: "Sun", workouts: 0, calories: 1900 }
];

const weightTrend = [
  { date: "W1", weight: 78.4 },
  { date: "W2", weight: 78.1 },
  { date: "W3", weight: 77.7 },
  { date: "W4", weight: 77.4 }
];

export function DashboardCharts({ macros }: { macros: { protein_g: number; carbs_g: number; fat_g: number } }) {
  const macroData = [
    { name: "Protein", value: macros.protein_g, color: "#D6B76A" },
    { name: "Carbs", value: macros.carbs_g, color: "#7FA68A" },
    { name: "Fat", value: macros.fat_g, color: "#A8B0BD" }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Weekly activity</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#253044" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={30} />
              <Tooltip />
              <Bar dataKey="workouts" name="Workouts" fill="#D6B76A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
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
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Body weight progress</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#253044" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={35} />
              <Tooltip />
              <Line dataKey="weight" name="Weight kg" stroke="#D6B76A" strokeWidth={3} dot={{ r: 4, fill: "#7FA68A" }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
