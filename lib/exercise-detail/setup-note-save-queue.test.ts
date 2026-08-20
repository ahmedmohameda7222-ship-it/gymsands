import { describe, expect, it } from "vitest";

import { drainLatestSetupNoteValue } from "./setup-note-save-queue";

describe("setup-note save queue", () => {
  it("serializes writes so a later edit cannot be overwritten by an older request", async () => {
    let desired = "Seat 4";
    let persisted = "";
    const calls: string[] = [];
    const states: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const worker = drainLatestSetupNoteValue({
      getDesired: () => desired,
      getPersisted: () => persisted,
      setPersisted: (value) => { persisted = value; },
      save: async (value) => {
        calls.push(value);
        if (calls.length === 1) await firstGate;
        return value;
      },
      onState: (state) => states.push(state),
    });

    await Promise.resolve();
    desired = "Seat 4 · Pad 3";
    releaseFirst();
    await worker;

    expect(calls).toEqual(["Seat 4", "Seat 4 · Pad 3"]);
    expect(persisted).toBe("Seat 4 · Pad 3");
    expect(states.at(-1)).toBe("saved");
  });

  it("reports failure without changing the desired edit so Retry can drain it", async () => {
    let desired = "Neutral handle";
    let persisted = "";
    const firstStates: string[] = [];
    const first = await drainLatestSetupNoteValue({
      getDesired: () => desired,
      getPersisted: () => persisted,
      setPersisted: (value) => { persisted = value; },
      save: async () => { throw new Error("offline"); },
      onState: (state) => firstStates.push(state),
    });
    expect(first).toBe(false);
    expect(desired).toBe("Neutral handle");
    expect(persisted).toBe("");
    expect(firstStates.at(-1)).toBe("failed");

    const retry = await drainLatestSetupNoteValue({
      getDesired: () => desired,
      getPersisted: () => persisted,
      setPersisted: (value) => { persisted = value; },
      save: async (value) => value,
    });
    expect(retry).toBe(true);
    expect(persisted).toBe("Neutral handle");
  });
});
