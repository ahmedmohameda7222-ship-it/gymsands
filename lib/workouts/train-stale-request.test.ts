import { describe, expect, it } from "vitest";
import { isTrainRequestCurrent, type TrainRequestIdentity } from "@/lib/workouts/train-overview-runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function commitWhenCurrent<T>(input: {
  request: Promise<T>;
  captured: TrainRequestIdentity;
  current: () => TrainRequestIdentity;
  commit: (value: T) => void;
}) {
  const value = await input.request;
  if (isTrainRequestCurrent(input.captured, input.current())) input.commit(value);
}

describe("Train overview stale-request protection", () => {
  it("does not let User A's delayed plan response overwrite User B", async () => {
    let current: TrainRequestIdentity = { userId: "user-a", date: "2026-07-13", generation: 1 };
    let plans = ["empty"];
    const request = deferred<string[]>();
    const task = commitWhenCurrent({ request: request.promise, captured: { ...current }, current: () => current, commit: (value) => { plans = value; } });
    current = { userId: "user-b", date: "2026-07-13", generation: 2 };
    plans = ["user-b-plan"];
    request.resolve(["user-a-plan"]);
    await task;
    expect(plans).toEqual(["user-b-plan"]);
  });

  it("does not let User A's delayed activity response overwrite User B", async () => {
    let current: TrainRequestIdentity = { userId: "user-a", date: "2026-07-13", generation: 4 };
    let activity = ["user-b-session"];
    const request = deferred<string[]>();
    const task = commitWhenCurrent({ request: request.promise, captured: { ...current }, current: () => current, commit: (value) => { activity = value; } });
    current = { userId: "user-b", date: "2026-07-13", generation: 5 };
    request.resolve(["user-a-session"]);
    await task;
    expect(activity).toEqual(["user-b-session"]);
  });

  it("discards an open-session result from the old user", async () => {
    let current: TrainRequestIdentity = { userId: "user-a", date: "2026-07-13", generation: 1 };
    let openSession: string | null = null;
    const request = deferred<string>();
    const task = commitWhenCurrent({ request: request.promise, captured: { ...current }, current: () => current, commit: (value) => { openSession = value; } });
    current = { userId: "user-b", date: "2026-07-13", generation: 2 };
    request.resolve("open-user-a");
    await task;
    expect(openSession).toBeNull();
  });

  it("prevents an older manual retry from reintroducing stale state", async () => {
    let current: TrainRequestIdentity = { userId: "user-a", date: "2026-07-13", generation: 8 };
    let value = "initial";
    const oldRetry = deferred<string>();
    const latestRetry = deferred<string>();
    const oldTask = commitWhenCurrent({ request: oldRetry.promise, captured: { ...current }, current: () => current, commit: (next) => { value = next; } });
    current = { ...current, generation: 9 };
    const latestTask = commitWhenCurrent({ request: latestRetry.promise, captured: { ...current }, current: () => current, commit: (next) => { value = next; } });
    latestRetry.resolve("latest");
    await latestTask;
    oldRetry.resolve("stale");
    await oldTask;
    expect(value).toBe("latest");
  });

  it("rejects a response captured before the local date changed", () => {
    expect(isTrainRequestCurrent(
      { userId: "user-a", date: "2026-07-13", generation: 3 },
      { userId: "user-a", date: "2026-07-14", generation: 3 }
    )).toBe(false);
  });
});
