import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(process.cwd(), "app/api/workouts/active-session/route.ts"),
  "utf8",
);
const clientSource = readFileSync(
  resolve(process.cwd(), "services/workouts/active-session-client.ts"),
  "utf8",
);
const workoutSessionsSource = readFileSync(
  resolve(process.cwd(), "services/database/workout-sessions.ts"),
  "utf8",
);

describe("PCS-3 active-session read authority", () => {
  it("keeps the server route authenticated and owner-scoped", () => {
    expect(routeSource).toContain("const context = await requireUser(request)");
    expect(routeSource).toContain('.eq("user_id", context.user.id)');
    expect(routeSource).toContain('.eq("status", "started")');
    expect(routeSource).not.toContain('searchParams.get("userId")');
    expect(routeSource).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(routeSource).toContain('Vary: "Authorization"');
  });

  it("uses the first-party route without a browser Supabase table read", () => {
    expect(clientSource).toContain('fetch(`/api/workouts/active-session${query}`');
    expect(clientSource).toContain("Authorization: `Bearer ${input.accessToken}`");
    expect(clientSource).toContain('cache: "no-store"');
    expect(clientSource).not.toContain("@/lib/supabase/client");
    expect(clientSource).not.toContain('.from("workout_sessions")');
  });

  it("routes online discovery through the authenticated client and preserves offline cache fallback", () => {
    expect(workoutSessionsSource).toContain(
      "readActiveWorkoutSessionAuthenticated",
    );
    expect(workoutSessionsSource).toContain("supabase.auth.getSession()");
    expect(workoutSessionsSource).toContain("readActiveWorkoutSessionCache");
    expect(workoutSessionsSource).toContain(
      "getOpenWorkoutSessionWithStatusLegacy",
    );
    expect(workoutSessionsSource).not.toContain(
      'supabase!\n    .from("workout_sessions")\n    .select("*")\n    .eq("user_id", userId)\n    .eq("status", "started")',
    );
  });
});
