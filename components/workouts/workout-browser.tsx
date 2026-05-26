"use client";

import Link from "next/link";
import { ArrowLeft, Dumbbell, Play, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWorkoutCategories, getWorkouts } from "@/services/database/repository";
import { useToast } from "@/components/ui/toaster";
import type { Workout } from "@/types";

const allValue = "all";
const pageSize = 60;

export function WorkoutBrowser() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [difficulty, setDifficulty] = useState(allValue);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    getWorkoutCategories()
      .then(setCategories)
      .catch((error) => {
        setCategories([]);
        toast({
          title: "Could not load workout categories",
          description: error instanceof Error ? error.message : "Please try again."
        });
      });
  }, [toast]);

  useEffect(() => {
    if (!selectedCategory) {
      setWorkouts([]);
      return;
    }

    setIsLoading(true);
    setPage(0);
    getWorkouts(
      query,
      {
        category: selectedCategory,
        difficulty: difficulty === allValue ? undefined : difficulty
      },
      0
    )
      .then((items) => {
        setWorkouts(items);
        setHasMore(items.length >= pageSize);
      })
      .catch((error) => {
        setWorkouts([]);
        toast({
          title: "Could not load workouts",
          description: error instanceof Error ? error.message : "Please try another category."
        });
      })
      .finally(() => setIsLoading(false));
  }, [difficulty, query, selectedCategory, toast]);

  const options = useMemo(() => {
    const source = workouts.length ? workouts : [];
    return {
      difficulty: Array.from(new Set(source.map((item) => item.difficulty)))
    };
  }, [workouts]);

  async function loadMore() {
    const nextPage = page + 1;
    setIsLoading(true);
    try {
      const items = await getWorkouts(
        query,
        {
          category: selectedCategory,
          difficulty: difficulty === allValue ? undefined : difficulty
        },
        nextPage
      );
      setWorkouts((current) => [...current, ...items]);
      setPage(nextPage);
      setHasMore(items.length >= pageSize);
    } catch (error) {
      toast({
        title: "Could not load more workouts",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (!selectedCategory) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border bg-blue-50 p-4">
          <p className="font-semibold text-blue-950">Choose a category first</p>
          <p className="mt-1 text-sm text-blue-800">Workouts load only after a category is selected, so the page stays fast on mobile.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((item) => (
            <Button
              key={item}
              variant="outline"
              className="h-auto justify-start rounded-md p-4 text-left"
              onClick={() => setSelectedCategory(item)}
            >
              <Dumbbell className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{item}</span>
            </Button>
          ))}
        </div>
        {!categories.length ? <p className="text-sm text-muted-foreground">No workout categories found yet.</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setSelectedCategory("")}>
          <ArrowLeft className="h-4 w-4" />
          Categories
        </Button>
        <Badge>{selectedCategory}</Badge>
        <span className="text-sm text-muted-foreground">{workouts.length} loaded</span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${selectedCategory} workouts, e.g. Squat or Cable Row`}
            className="pl-10"
          />
        </div>
        <FilterSelect value={difficulty} onValueChange={setDifficulty} placeholder="Difficulty" values={options.difficulty} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && !workouts.length ? <p className="text-sm text-muted-foreground">Loading {selectedCategory} workouts...</p> : null}
        {!isLoading && !workouts.length ? <p className="text-sm text-muted-foreground">No workouts found in this category yet.</p> : null}
        {workouts.map((workout) => (
          <Card key={workout.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{workout.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{workout.target_muscle}</p>
                </div>
                <Badge>{workout.difficulty}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">{workout.category}</Badge>
                <Badge variant="outline">{workout.equipment}</Badge>
                {workout.sets ? <Badge variant="outline">{workout.sets} sets</Badge> : null}
                {workout.reps ? <Badge variant="outline">{workout.reps}</Badge> : null}
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{workout.instructions}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <Link href={`/workouts/${workout.id}`}>Details</Link>
                </Button>
                <Button asChild>
                  <Link href={`/workouts/session/${workout.id}`}>
                    <Play className="h-4 w-4" />
                    Start
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  values
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  values: string[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>All {placeholder.toLowerCase()}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
