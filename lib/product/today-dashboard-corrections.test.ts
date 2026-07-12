import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(path, "utf8");

describe("Today dashboard implementation contracts", () => {
  it("uses official isolated OpenAI assets", () => {
    expect(source("components/brand/openai-blossom.tsx")).toContain("OAI_OpenAI-Blossom_Black.svg");
    expect(source("components/brand/openai-blossom.tsx")).toContain("OAI_OpenAI-Blossom_White.svg");
  });

  it("keeps prompt detail in the shared surface with editable clipboard handoff", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    const surface = source("components/ai/quick-chatgpt-surface.tsx");
    expect(provider).toContain("QuickChatGptSurface");
    expect(surface).toContain("textarea");
    expect(surface).toContain("navigator.clipboard.writeText");
    expect(surface).toContain('window.open("about:blank"');
    expect(surface).not.toContain("Continue with ChatGPT");
  });

  it("uses the responsive drawer and canonical permission evaluator", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    const surface = source("components/ai/quick-chatgpt-surface.tsx");
    expect(surface).toContain('layout="responsive-drawer"');
    expect(provider).toContain("permissionLabelKeys");
    expect(provider).toContain("evaluatePromptPermission");
    expect(surface).toContain("getPromptPermissionLabel");
  });

  it("uses checked for grocery bought and a persistent skipped meal status", () => {
    expect(source("components/dashboard/today-dashboard.tsx")).toContain("checked: !item.checked");
    expect(source("services/database/meal-plan.ts")).toContain('status: "skipped"');
  });

  it("keeps Today action copy localized and outside the model", () => {
    expect(source("components/dashboard/today-dashboard.tsx")).toContain('tt("noActivityToday")');
    expect(source("lib/dashboard/today-model.ts")).not.toContain('title: "Resume active workout"');
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
