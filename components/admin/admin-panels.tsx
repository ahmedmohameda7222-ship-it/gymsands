"use client";

import { FormEvent, useEffect, useState } from "react";
import { RefreshCcw, Save, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import {
  adminImportExerciseVideos,
  adminListUsers,
  adminUpdateUserRole,
  adminUpdateWelcomeSettings,
  adminUpsertExerciseVideo,
  adminUpsertGlobalFood,
  adminUpsertWelcomeMessage,
  getGlobalFoods,
  getWorkouts
} from "@/services/database/repository";
import type { FoodItem, Workout } from "@/types";
import { supabase } from "@/lib/supabase/client";

export function AdminUsersPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    adminListUsers().then(setUsers);
  }, []);

  async function setRole(id: string, role: "member" | "admin") {
    await adminUpdateUserRole(id, role);
    setUsers((current) => current.map((user) => (user.id === id ? { ...user, role } : user)));
    toast({ title: "User role updated", description: "Passwords are never visible in FitLife Hub admin." });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {users.map((user) => (
        <Card key={user.id}>
          <CardContent className="pt-5">
            <p className="font-semibold">{user.full_name || "FitLife Hub member"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-4">
              <Label>Role</Label>
              <Select value={user.role} onValueChange={(value) => setRole(user.id, value as "member" | "admin")}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminFoodPanel() {
  const { toast } = useToast();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [form, setForm] = useState({
    food_name: "",
    serving_size: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    category: ""
  });

  useEffect(() => {
    getGlobalFoods("").then((items) => setFoods(items.slice(0, 12)));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await adminUpsertGlobalFood({
      ...form,
      calories: Number(form.calories),
      protein_g: Number(form.protein_g),
      carbs_g: Number(form.carbs_g),
      fat_g: Number(form.fat_g),
      source_type: "admin_created",
      cuisine: "Egyptian"
    });
    toast({ title: "Global food saved", description: "Members can log portions but cannot edit base macros." });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add or edit Egyptian food</CardTitle>
          <CardDescription>Only admins can edit global food base macros.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <TextField label="Food name" value={form.food_name} onChange={(food_name) => setForm((current) => ({ ...current, food_name }))} placeholder="Food name, e.g. Molokhia" />
            <TextField label="Serving size" value={form.serving_size} onChange={(serving_size) => setForm((current) => ({ ...current, serving_size }))} placeholder="Serving size, e.g. 1 bowl" />
            <TextField label="Calories" type="number" value={form.calories} onChange={(calories) => setForm((current) => ({ ...current, calories }))} placeholder="Calories, e.g. 180" />
            <TextField label="Protein g" type="number" value={form.protein_g} onChange={(protein_g) => setForm((current) => ({ ...current, protein_g }))} placeholder="Protein grams, e.g. 5" />
            <TextField label="Carbs g" type="number" value={form.carbs_g} onChange={(carbs_g) => setForm((current) => ({ ...current, carbs_g }))} placeholder="Carbs grams, e.g. 12" />
            <TextField label="Fat g" type="number" value={form.fat_g} onChange={(fat_g) => setForm((current) => ({ ...current, fat_g }))} placeholder="Fat grams, e.g. 12" />
            <div className="sm:col-span-2">
              <TextField label="Category" value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} placeholder="Category, e.g. Stew" />
            </div>
            <Button className="sm:col-span-2">
              <Save className="h-4 w-4" />
              Save global food
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Current global foods</CardTitle>
          <CardDescription>Preview of seeded Egyptian foods.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {foods.map((food) => (
            <div key={food.id} className="rounded-md border p-3">
              <p className="font-semibold">{food.food_name}</p>
              <p className="text-sm text-muted-foreground">
                {food.calories} kcal | {food.protein_g}g protein | {food.carbs_g}g carbs | {food.fat_g}g fat
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminWorkoutPanel() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    getWorkouts("").then(setWorkouts);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {workouts.map((workout) => (
        <Card key={workout.id}>
          <CardContent className="pt-5">
            <p className="font-semibold">{workout.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {workout.target_muscle} | {workout.equipment} | {workout.difficulty}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{workout.instructions}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type ExerciseRow = {
  id: string;
  source: string;
  source_id: string | null;
  source_url: string | null;
  license: string | null;
  license_author: string | null;
  name: string;
  primary_muscle: string | null;
  equipment: string[] | null;
  difficulty: string | null;
  is_approved: boolean;
  is_global: boolean;
};

export function AdminExerciseLibraryPanel() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [filters, setFilters] = useState({ source: "all", visibility: "active", muscle: "", equipment: "", difficulty: "" });
  const [form, setForm] = useState({ name: "", primary_muscle: "", equipment: "", difficulty: "Beginner", instructions: "" });

  async function loadExercises() {
    if (!supabase) return;
    let request = supabase.from("exercises").select("id,source,source_id,source_url,license,license_author,name,primary_muscle,equipment,difficulty,is_approved,is_global").order("created_at", { ascending: false }).limit(2000);
    if (filters.source !== "all") request = request.eq("source", filters.source);
    if (filters.visibility !== "all") request = request.eq("is_global", filters.visibility === "active");
    if (filters.muscle) request = request.ilike("primary_muscle", `%${filters.muscle}%`);
    if (filters.difficulty) request = request.ilike("difficulty", `%${filters.difficulty}%`);
    const { data, error } = await request;
    if (error) {
      toast({ title: "Could not load exercises", description: error.message });
      return;
    }
    const equipmentFilter = filters.equipment.toLowerCase();
    setExercises(((data ?? []) as ExerciseRow[]).filter((exercise) => !equipmentFilter || (exercise.equipment ?? []).join(" ").toLowerCase().includes(equipmentFilter)));
  }

  useEffect(() => {
    loadExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.visibility]);

  async function setExerciseVisibility(id: string, visible: boolean) {
    const action = visible ? "approve" : "remove";
    const response = await fetch(`/api/exercises/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify({ id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: visible ? "Restore failed" : "Remove failed", description: data.error ?? "Please try again." });
    toast({ title: visible ? "Exercise restored" : "Exercise removed" });
    loadExercises();
  }

  async function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !form.name.trim()) return;
    const { error } = await supabase.from("exercises").insert({
      source: "manual",
      name: form.name.trim(),
      slug: `manual-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      primary_muscle: form.primary_muscle || null,
      equipment: form.equipment.split(",").map((item) => item.trim()).filter(Boolean),
      difficulty: form.difficulty || null,
      instructions: form.instructions || null,
      is_approved: true,
      is_global: true
    });
    if (error) return toast({ title: "Could not add exercise", description: error.message });
    setForm({ name: "", primary_muscle: "", equipment: "", difficulty: "Beginner", instructions: "" });
    toast({ title: "Manual exercise added", description: "It is active and available to the generator." });
    loadExercises();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Exercise filters</CardTitle>
          <CardDescription>Imported wger exercises are active immediately. Remove anything you do not want members to use.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <Select value={filters.source} onValueChange={(source) => setFilters((current) => ({ ...current, source }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="wger">wger</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.visibility} onValueChange={(visibility) => setFilters((current) => ({ ...current, visibility }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
              <SelectItem value="all">All visibility</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Muscle" value={filters.muscle} onChange={(event) => setFilters((current) => ({ ...current, muscle: event.target.value }))} />
          <Input placeholder="Equipment" value={filters.equipment} onChange={(event) => setFilters((current) => ({ ...current, equipment: event.target.value }))} />
          <Button type="button" variant="outline" onClick={loadExercises}><RefreshCcw className="h-4 w-4" /> Refresh</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add manual exercise</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={addManual}>
            <Input placeholder="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <Input placeholder="Primary muscle" value={form.primary_muscle} onChange={(event) => setForm((current) => ({ ...current, primary_muscle: event.target.value }))} />
            <Input placeholder="Equipment, comma-separated" value={form.equipment} onChange={(event) => setForm((current) => ({ ...current, equipment: event.target.value }))} />
            <Input placeholder="Difficulty" value={form.difficulty} onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value }))} />
            <Button><Save className="h-4 w-4" /> Add</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3 xl:grid-cols-2">
        {exercises.map((exercise) => (
          <Card key={exercise.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{exercise.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {exercise.source} | {exercise.primary_muscle ?? "General"} | {(exercise.equipment ?? []).join(", ") || "Varies"}
                  </p>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${exercise.is_global ? "text-primary" : "text-muted-foreground"}`}>
                  {exercise.is_global ? "Active" : "Removed"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Source ID: {exercise.source_id ?? "manual"} | License: {exercise.license ?? "not supplied"} {exercise.license_author ? `by ${exercise.license_author}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {exercise.is_global ? (
                  <Button size="sm" variant="outline" onClick={() => setExerciseVisibility(exercise.id, false)}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setExerciseVisibility(exercise.id, true)}>
                    <RefreshCcw className="h-4 w-4" />
                    Restore
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AdminApiImportsPanel() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [limit, setLimit] = useState("100");
  const [offset, setOffset] = useState("0");
  const [batches, setBatches] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  async function loadBatches() {
    if (!supabase) return;
    const { data } = await supabase.from("exercise_import_batches").select("*").order("created_at", { ascending: false }).limit(20);
    setBatches(data ?? []);
  }

  useEffect(() => {
    loadBatches();
  }, []);

  async function importWger() {
    setIsImporting(true);
    const response = await fetch("/api/exercises/wger/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify({ limit: Number(limit), offset: Number(offset) })
    });
    const data = await response.json().catch(() => ({}));
    setIsImporting(false);
    if (!response.ok) return toast({ title: "wger import not completed", description: data.error ?? "Please check configuration." });
    toast({ title: "wger import completed", description: `${data.importedCount} fetched, ${data.activatedCount ?? data.importedCount} new exercises activated.` });
    loadBatches();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Import from wger</CardTitle>
          <CardDescription>wger is the only exercise API import source. New rows become active immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TextField label="Limit" type="number" value={limit} onChange={setLimit} placeholder="100" />
          <TextField label="Offset" type="number" value={offset} onChange={setOffset} placeholder="0" />
          <Button onClick={importWger} disabled={isImporting}>
            <Upload className="h-4 w-4" />
            {isImporting ? "Importing..." : "Import wger exercises"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Import batch history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-md border p-3">
              <p className="font-semibold">{batch.source} | {batch.status}</p>
              <p className="text-sm text-muted-foreground">
                Fetched {batch.imported_count ?? 0} | New active {batch.approved_count ?? 0} | Removed {batch.rejected_count ?? 0}
              </p>
              {batch.error_message ? <p className="mt-1 text-sm text-destructive">{batch.error_message}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminApiStatusPanel() {
  const { session } = useAuth();
  const [providers, setProviders] = useState<Array<{ provider: string; configured: boolean }>>([]);
  const { toast } = useToast();

  async function loadStatus() {
    const response = await fetch("/api/admin/api-status", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Could not load API status", description: data.error ?? "Please try again." });
    setProviders(data.providers ?? []);
  }

  useEffect(() => {
    if (session?.access_token) loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Status</CardTitle>
        <CardDescription>Secrets are never displayed. Only configured state is shown.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((item) => (
          <div key={item.provider} className="flex items-center justify-between rounded-md border bg-card p-3">
            <span className="font-medium">{item.provider}</span>
            <span className={item.configured ? "text-primary" : "text-muted-foreground"}>{item.configured ? "Configured" : "Not configured"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminVideoPanel() {
  const { toast } = useToast();
  const [exerciseName, setExerciseName] = useState("");
  const [category, setCategory] = useState("");
  const [exerciseUrl, setExerciseUrl] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await adminUpsertExerciseVideo({
      exercise_name: exerciseName,
      category_type: "Muscle Group",
      category,
      exercise_url: exerciseUrl,
      source: "admin_created"
    });
    toast({ title: "Workout video saved", description: "Matching uses exercise name and category." });
  }

  async function importSample() {
    await adminImportExerciseVideos([
      {
        exercise_name: "Dumbbell Shoulder Press",
        category_type: "Muscle Group",
        category: "Shoulders",
        exercise_url: "",
        video_url: null,
        instructions: "Brace your core, press overhead with control, and lower slowly.",
        source: "manual_admin_sample"
      }
    ]);
    toast({ title: "Sample import completed", description: "Use wger imports for the active exercise library." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage workout videos</CardTitle>
        <CardDescription>Direct video URLs embed in-app. Instruction page URLs are stored until replaced with embeddable videos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
          <TextField label="Exercise name" value={exerciseName} onChange={setExerciseName} placeholder="Exercise name, e.g. Military Press" />
          <TextField label="Category" value={category} onChange={setCategory} placeholder="Category, e.g. Shoulders" />
          <div className="sm:col-span-2">
            <TextField label="Instruction URL" value={exerciseUrl} onChange={setExerciseUrl} placeholder="Video or exercise URL, e.g. https://..." />
          </div>
          <Button>
            <Save className="h-4 w-4" />
            Save video
          </Button>
          <Button type="button" variant="outline" onClick={importSample}>
            <Upload className="h-4 w-4" />
            Test import
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminWelcomePanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("Welcome back to FitLife Hub. Ready for today?");
  const [frequency, setFrequency] = useState<"every_login" | "once_per_day">("once_per_day");

  async function saveUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await adminUpsertWelcomeMessage({ user_id: userId, message, popup_enabled: true, show_frequency: frequency });
    toast({ title: "Welcome message saved", description: "This user will see the custom FitLife Hub message." });
  }

  async function saveDefault() {
    await adminUpdateWelcomeSettings({ default_message: message, popup_enabled: true, show_frequency: frequency });
    toast({ title: "Default welcome message saved", description: "Users without a custom message will see this." });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Welcome message</CardTitle>
          <CardDescription>Set default or user-specific welcome popups.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={saveUserMessage}>
            <TextField label="User ID" value={userId} onChange={setUserId} placeholder="Member user ID" />
            <TextField label="Message" value={message} onChange={setMessage} placeholder="Welcome back to FitLife Hub. Ready for today?" />
            <Select value={frequency} onValueChange={(value) => setFrequency(value as "every_login" | "once_per_day")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once_per_day">Once per day</SelectItem>
                <SelectItem value="every_login">Every login</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="submit">Save for user</Button>
              <Button type="button" variant="outline" onClick={saveDefault}>
                Save default
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="bg-blue-50">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Members see this after login or once per day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="text-lg font-semibold">Welcome back</p>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
