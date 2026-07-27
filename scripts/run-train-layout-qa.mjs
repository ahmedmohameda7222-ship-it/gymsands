// Preserve the established Train viewport and regression matrix first.
await import("./run-train-layout-qa-base.mjs");

// Then exercise the Planner-rejected AW-5 states and geometry contracts.
await import("./run-aw5-correction-layout-qa.mjs");
