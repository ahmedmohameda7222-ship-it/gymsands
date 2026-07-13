import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function primaryNavigationBlock(shell: string) {
  return shell.match(/const primaryNavItems:[\s\S]*?\n\];/)?.[0] ?? "";
}

function mealSectionBlock(client: string) {
  return client.split("function MealSection")[1]?.split("function MealRow")[0] ?? "";
}

describe("My Meal Plan post-merge visual refinements", () => {
  it("keeps Eat and Meal Plan active states mutually exclusive", () => {
    const shell = source("components/layout/app-shell.tsx");
    const primary = primaryNavigationBlock(shell);

    expect(primary).toContain('{ href: "/calories", labelKey: "nav.eat", icon: Utensils, activePaths: ["/calories"] }');
    expect(primary).not.toContain('activePaths: ["/calories", "/my-meal-plan"]');
    expect(shell).toContain('{ href: "/my-meal-plan", labelKey: "nav.mealPlan", icon: ClipboardList }');
    expect(shell).toContain('pathname.startsWith(`${path}/`)');
  });

  it("uses active styling without a persistent mouse-focus ring", () => {
    const tabs = source("components/ui/tabs.tsx");

    expect(tabs).toContain("data-[state=active]:bg-primary");
    expect(tabs).toContain("focus-visible:ring-2");
    expect(tabs).toContain("focus-visible:ring-offset-2");
    expect(tabs).toContain("outline-none");
    expect(tabs).not.toContain(" focus:ring-2");
  });

  it("fills the desktop day strip while preserving mobile horizontal scrolling", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");

    expect(client).toContain("grid-flow-col");
    expect(client).toContain("overflow-x-auto");
    expect(client).toContain("lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible");
    expect(client).toContain("auto-cols-[minmax(84px,1fr)]");
  });

  it("keeps one contextual add action in empty meal sections", () => {
    const section = mealSectionBlock(source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx"));

    expect(section).toContain('actions={(');
    expect(section).toContain('aria-label={addLabelForType(props.type, props.c)}');
    expect(section).toContain('{!section.items.length ? <p className="p-4 text-sm text-muted-foreground">{props.c.noMeals}</p> : null}');
    expect(section.match(/props\.onAdd/g)).toHaveLength(1);
  });

  it("uses the refined overview, compact rows, and calmer completed state", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    const copy = source("lib/meals/meal-plan-copy.ts");

    expect(client).toContain("{c.dailyOverview}");
    expect(client).toContain("<Metric label={c.target}");
    expect(client).toContain('item.status === "done" && "bg-muted/25"');
    expect(client).toContain('triggerClassName="min-h-11 px-2.5 text-xs sm:text-sm"');
    expect(copy).toContain('dailyOverview: "Daily overview"');
    expect(copy).toContain('dailyOverview: "Tagesübersicht"');
    expect(copy).toContain('dailyOverview: "نظرة يومية"');
  });

  it("centers Week navigation and keeps Week cards compact", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");

    expect(client).toContain("grid-cols-[auto_minmax(0,1fr)_auto] items-center");
    expect(client).toContain("min-w-0 text-center font-semibold");
    expect(client).toContain("gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7");
    expect(client).toContain('dayItems.length ? "min-h-36" : "min-h-24 bg-muted/20"');
    expect(client).toContain("daySummary.counts.planned");
    expect(client).toContain("daySummary.scheduled.calories");
    expect(client).toContain("daySummary.consumed.calories");
    expect(client).toContain("daySummary.alignmentPercent");
  });

  it("uses compact empty Week copy and distinguishes Today from selected", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    const copy = source("lib/meals/meal-plan-copy.ts");

    expect(copy).toContain('noWeekMeals: "No meals"');
    expect(copy).not.toContain("No meals planned for this day.");
    expect(client).toContain("{c.today}");
    expect(client).toContain("{c.selected}");
    expect(client).toContain('aria-current={isSelected ? "date" : undefined}');
  });

  it("right-aligns mobile header actions without full-width buttons", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");

    expect(client).toContain('className="ms-auto flex w-full flex-wrap justify-end gap-2 lg:w-auto"');
    expect(client).not.toContain("[&_button]:w-full");
  });

  it("simplifies Shopping without removing existing PDF, Share, or Quick Add behavior", () => {
    const grocery = source("components/meals/grocery-list-panel.tsx");

    expect(grocery).not.toContain("Download CSV");
    expect(grocery).not.toContain("function exportCsv");
    expect(grocery).toContain("Download PDF");
    expect(grocery).toContain("Share");
    expect(grocery).toContain("Quick add");
    expect(grocery).toContain('buttonVariant="outline"');
    expect(grocery).toContain("Your grocery list is empty.");
    expect(grocery).toContain("Ask ChatGPT to build an ingredient-level list from your meal plan.");
    expect(grocery).toContain("!isLoading && !loadError && items.length ?");
  });

  it("does not mention Quick Add in the empty-state copy", () => {
    const grocery = source("components/meals/grocery-list-panel.tsx");
    const emptyCopy = grocery.split("const shoppingCopy")[1]?.split("export function GroceryListPanel")[0] ?? "";

    expect(emptyCopy).not.toMatch(/Quick add/i);
  });
});
