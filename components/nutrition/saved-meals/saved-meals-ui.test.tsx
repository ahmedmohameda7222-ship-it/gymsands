import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SavedMealEditor } from "@/components/nutrition/saved-meals/saved-meal-editor";
import { SavedMealPicker } from "@/components/nutrition/saved-meals/saved-meal-picker";
import { RecentlyDeletedSavedMeals } from "@/components/nutrition/saved-meals/recently-deleted-saved-meals";

const savedMealId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function markup(node: React.ReactNode) {
  return renderToStaticMarkup(node);
}

describe("Saved Meal contextual utility UI", () => {
  it("renders an editor with Food and Recipe composition only", () => {
    const html = markup(
      <SavedMealEditor
        mode="create"
        name="Lunch staples"
        note=""
        items={[
          { id: "food-1", kind: "food", name: "Greek yogurt", servingLabel: "170 g" },
          { id: "recipe-1", kind: "recipe", name: "Chicken bowl", servingLabel: "1 bowl" },
        ]}
        onNameChange={vi.fn()}
        onNoteChange={vi.fn()}
        onAddFood={vi.fn()}
        onAddRecipe={vi.fn()}
        onRemoveItem={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("Create Saved Meal");
    expect(html).toContain("Greek yogurt");
    expect(html).toContain("Chicken bowl");
    expect(html).toContain("Add Food");
    expect(html).toContain("Add Recipe");
    expect(html).toContain("Save Saved Meal");
    expect(html).not.toMatch(/Add Saved Meal|nested Saved Meal/i);
    expect(html).not.toContain('href="/saved-meals"');
  });

  it("renders a contextual picker as actions, not peer navigation", () => {
    const html = markup(
      <SavedMealPicker
        meals={[
          { id: savedMealId, name: "Lunch staples", itemCount: 2, summary: "660 kcal" },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Breakfast", itemCount: 3, summary: null },
        ]}
        onPick={vi.fn()}
      />,
    );

    expect(html).toContain("Saved Meals");
    expect(html).toContain("Lunch staples");
    expect(html).toContain("2 items");
    expect(html).toContain("660 kcal");
    expect(html).toContain(`data-saved-meal-id="${savedMealId}"`);
    expect(html).not.toContain('href="/saved-meals"');
  });

  it("uses Recently Deleted with Restore and Delete Now rather than Archive", () => {
    const html = markup(
      <RecentlyDeletedSavedMeals
        items={[
          {
            id: savedMealId,
            name: "Lunch staples",
            deletedAtLabel: "Deleted today",
            purgeAfterLabel: "Permanently deletes in 30 days",
          },
        ]}
        onRestore={vi.fn()}
        onDeleteNow={vi.fn()}
      />,
    );

    expect(html).toContain("Recently Deleted");
    expect(html).toContain("Restore");
    expect(html).toContain("Delete Now");
    expect(html).toContain("30 days");
    expect(html).not.toMatch(/Archive|Archived/);
    expect(html).not.toContain('href="/saved-meals"');
  });
});
