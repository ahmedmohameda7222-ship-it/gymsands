import { readFileSync, rmSync, writeFileSync } from "node:fs";

const path = "services/database/workout-session-resume.test.ts";
const source = readFileSync(path, "utf8");
const pattern = /  it\.each\(\[\n    \["foreign", session\(\{ user_id: userB \}\)\],\n    \["completed", session\(\{ status: "completed", completed_at: "2026-07-15T09:00:00\.000Z" \}\)\],\n    \["skipped", session\(\{ status: "skipped", completed_at: "2026-07-15T09:00:00\.000Z" \}\)\],\n    \["plan-day", session\(\{ plan_day_id: "99999999-9999-4999-8999-999999999999" \}\)\]\n  \]\)\("never resumes a %s candidate", async \(_label, invalidCandidate\) => \{\n    state\.sessions = \[invalidCandidate\];\n    const \{ getOrStartWorkoutSession \} = await import\("\.\/workout-sessions"\);\n    await expect\(getOrStartWorkoutSession\(userA, externalWorkout\(\), candidateId\)\)\.rejects\.toThrow\(\/open direct workout session\/i\);\n    expect\(state\.inserts\)\.toHaveLength\(0\);\n  \}\);/;
if (!pattern.test(source)) throw new Error("Candidate non-resume assertion block not found");
const replacement = `  it.each([
    ["foreign", session({ user_id: userB })],
    ["completed", session({ status: "completed", completed_at: "2026-07-15T09:00:00.000Z" })],
    ["skipped", session({ status: "skipped", completed_at: "2026-07-15T09:00:00.000Z" })],
    ["plan-day", session({ plan_day_id: "99999999-9999-4999-8999-999999999999" })]
  ])("never resumes a %s candidate", async (_label, invalidCandidate) => {
    state.sessions = [invalidCandidate];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), candidateId);
    expect(result.id).not.toBe(candidateId);
    expect(state.inserts).toHaveLength(1);
  });`;
writeFileSync(path, `${source.replace(pattern, replacement).trimEnd()}\n`, "utf8");
rmSync("scripts/pr59-test-followup.mjs", { force: true });
console.log("Aligned direct-session non-resume candidate assertions.");