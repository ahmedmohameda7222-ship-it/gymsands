import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(path, "utf8");

describe("Today dashboard implementation contracts", () => {
  it("uses official isolated OpenAI assets", () => {
    expect(source("components/brand/openai-blossom.tsx")).toContain("OAI_OpenAI-Blossom_Black.svg");
    expect(source("components/brand/openai-blossom.tsx")).toContain("OAI_OpenAI-Blossom_White.svg");
  });

  it("keeps prompt detail in the shared surface with editable clipboard handoff", () => {
    const ui = source("components/ai/quick-chatgpt-provider.tsx");
    expect(ui).toContain("textarea");
    expect(ui).toContain("navigator.clipboard.writeText");
    expect(ui).toContain('window.open("about:blank"');
    expect(ui).not.toContain("Continue with ChatGPT");
  });

  it("uses the bottom-sheet layout at phone widths and localized permission labels", () => {
    const ui = source("components/ai/quick-chatgpt-provider.tsx");
    expect(ui).toContain("inset-x-0 bottom-0 left-0 top-auto");
    expect(ui).toContain("permissionLabelKeys");
    expect(ui).not.toContain('missingSections.join(", ")');
  });

  it("uses checked for grocery bought and a persistent skipped meal status", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const mealService = source("services/database/meal-plan.ts");
    expect(dashboard).toContain("checked: !item.checked");
    expect(mealService).toContain('status: "skipped"');
  });

  it("keeps Today action copy localized and outside the model", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const model = source("lib/dashboard/today-model.ts");
    expect(dashboard).toContain('tt("noActivityToday")');
    expect(model).not.toContain('title: "Resume active workout"');
  });

  it("keeps unknown food totals and completed workouts out of mutating paths", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain('tt("foodLogsUnavailable")');
    expect(dashboard).toContain("activitySourcesKnown");
    expect(dashboard).toContain("todayWorkoutActionHref");
  });

  it("keeps registration, onboarding and OAuth outside this change", () => {
    expect(source("app/register/page.tsx")).toMatch(/age/i);
    expect(source("components/settings/connected-apps.tsx")).toContain("TemporaryChatGptDeveloperSetupCard");
  });
});
