from pathlib import Path

path = Path("components/workouts/active-workout/active-workout-core-session.identity.test.tsx")
text = path.read_text()
old = '        rawCompatibilityPrescription: {},\n'
new = '        rawCompatibilityPrescription: { reps: "8" },\n'
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one empty compatibility fixture, found {count}")
path.write_text(text.replace(old, new, 1))
