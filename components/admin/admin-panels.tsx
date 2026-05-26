"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Upload } from "lucide-react";
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

export function AdminUsersPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    adminListUsers().then(setUsers);
  }, []);

  async function setRole(id: string, role: "member" | "admin") {
    await adminUpdateUserRole(id, role);
    setUsers((current) => current.map((user) => (user.id === id ? { ...user, role } : user)));
    toast({ title: "User role updated", description: "Passwords are never visible in S&S Gym admin." });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {users.map((user) => (
        <Card key={user.id}>
          <CardContent className="pt-5">
            <p className="font-semibold">{user.full_name || "S&S Gym member"}</p>
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
        exercise_name: "Military Press (AKA Overhead Press)",
        category_type: "Muscle Group",
        category: "Shoulders",
        exercise_url: "https://www.muscleandstrength.com/exercises/military-press.html",
        video_url: null,
        instructions: "Brace your core, press overhead with control, and lower slowly.",
        source: "user_provided_workout_video_table"
      }
    ]);
    toast({ title: "Sample import completed", description: "Use the SQL/CSV import template for the full 3000+ records." });
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
  const [message, setMessage] = useState("Welcome back to S&S Gym. Ready for today?");
  const [frequency, setFrequency] = useState<"every_login" | "once_per_day">("once_per_day");

  async function saveUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await adminUpsertWelcomeMessage({ user_id: userId, message, popup_enabled: true, show_frequency: frequency });
    toast({ title: "Welcome message saved", description: "This user will see the custom S&S Gym message." });
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
            <TextField label="Message" value={message} onChange={setMessage} placeholder="Welcome back to S&S Gym. Ready for today?" />
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
