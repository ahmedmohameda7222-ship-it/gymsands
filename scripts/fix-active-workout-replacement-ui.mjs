import fs from "node:fs";

const detailsPath = "components/workouts/active-workout/active-workout-details-bridge.tsx";
const corePath = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
let details = fs.readFileSync(detailsPath, "utf8");
let core = fs.readFileSync(corePath, "utf8");

details = details.replace('  isolateBidiText,\n', '');
core = core.replace(
  '  async function applyStableReplacement(replacement: Workout): Promise<boolean> {\n    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return;\n',
  '  async function applyStableReplacement(replacement: Workout): Promise<boolean> {\n    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return false;\n'
);
core = core.replace(
  '      }).catch((error) => {\n        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);\n      });\n    } catch (error) {\n      setSetFeedbackVariant("error");\n',
  '      }).catch((error) => {\n        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);\n      });\n      return true;\n    } catch (error) {\n      setSetFeedbackVariant("error");\n'
);

fs.writeFileSync(detailsPath, details);
fs.writeFileSync(corePath, core);
console.log("Active Workout replacement return contract fixed.");
