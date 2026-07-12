import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("ChatGPT responsive drawer and prompt library contracts", () => {
  it("uses an explicit responsive drawer without desktop centered transforms", () => {
    const dialog = source("components/ui/dialog.tsx");
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    expect(dialog).toContain('layout?: "dialog" | "responsive-drawer"');
    expect(dialog).toContain('layout === "responsive-drawer"');
    expect(dialog).toContain("lg:right-0");
    expect(dialog).toContain("lg:rtl:left-0");
    expect(dialog).toContain("lg:h-dvh");
    const drawerBranch = dialog.split('layout === "responsive-drawer"')[1].split(":")[0];
    expect(drawerBranch).not.toContain("-translate-x-1/2");
    expect(drawerBranch).not.toContain("-translate-y-1/2");
    expect(provider).toContain('layout="responsive-drawer"');
  });

  it("keeps the drawer header fixed while only its body scrolls", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    expect(provider).toContain("shrink-0 border-b");
    expect(provider).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(provider).toContain('closeLabel={tt("close")}');
  });

  it("keeps mobile as a bottom sheet and desktop attached to an edge", () => {
    const dialog = source("components/ui/dialog.tsx");
    expect(dialog).toContain("inset-x-0 bottom-0 top-auto");
    expect(dialog).toContain("max-h-[85dvh]");
    expect(dialog).toContain("rounded-t-[24px]");
    expect(dialog).toContain("lg:left-auto lg:right-0");
    expect(dialog).toContain("lg:rtl:left-0 lg:rtl:right-auto");
  });

  it("uses one surface for home, library, detail and custom detail", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    expect(provider).toContain('{ name: "home" }');
    expect(provider).toContain('{ name: "library" }');
    expect(provider).toContain('{ name: "detail"; promptId: string; backTo: "home" | "library" }');
    expect(provider).toContain('{ name: "custom-detail" }');
    expect(provider.match(/<Dialog /g)?.length).toBe(1);
    expect(provider).toContain('setView({ name: "library" })');
    expect(provider).toContain('openDefinition(id, "library")');
  });

  it("provides search, categories, availability, access and attachment states", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    expect(provider).toContain('type="search"');
    expect(provider).toContain("PROMPT_CATEGORIES");
    expect(provider).toContain("getPromptAvailability");
    expect(provider).toContain('tt("requiresContext")');
    expect(provider).toContain('tt("requiresAccess")');
    expect(provider).toContain('tt("attachmentRequired")');
    expect(provider).toContain('aria-pressed={category === item}');
  });

  it("preserves editable, resettable, clipboard and ChatGPT handoff behavior", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    expect(provider).toContain("<textarea");
    expect(provider).toContain("navigator.clipboard.writeText");
    expect(provider).toContain('window.open("about:blank"');
    expect(provider).toContain("setEditedPrompt(generatedPrompt)");
    expect(provider).not.toContain("Continue with ChatGPT");
  });

  it("removes the duplicate Today prompt card while preserving the header action", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain('onClick={() => openPrompts()}');
    expect(dashboard).toContain('tt("askChatGpt")');
    expect(dashboard).not.toContain("dashboardPrompts.map");
    expect(dashboard).not.toContain('tt("viewAllPrompts")');
    expect(dashboard).not.toContain("rankQuickPrompts");
  });

  it("centers secondary Today actions with stable equal-height layout", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain("auto-rows-fr");
    expect(dashboard).toContain("h-full min-h-24");
    expect(dashboard).toContain("self-center shrink-0");
    expect(dashboard).not.toMatch(/translate-y-\[|top-\[\d/);
  });

  it("does not add or modify a migration for this UX correction", () => {
    const ledger = source("supabase/migration-ledger.json");
    expect(ledger).not.toContain("chatgpt_drawer_prompt_library");
  });
});
