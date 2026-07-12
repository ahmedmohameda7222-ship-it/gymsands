import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const provider = source("components/ai/quick-chatgpt-provider.tsx");
const surface = source("components/ai/quick-chatgpt-surface.tsx");
const ui = `${provider}\n${surface}`;

describe("ChatGPT responsive drawer and prompt library contracts", () => {
  it("uses an explicit responsive drawer without desktop centered transforms", () => {
    const dialog = source("components/ui/dialog.tsx");
    expect(dialog).toContain('layout?: "dialog" | "responsive-drawer"');
    expect(dialog).toContain('layout === "responsive-drawer"');
    expect(dialog).toContain("lg:right-0");
    expect(dialog).toContain("lg:rtl:left-0");
    expect(dialog).toContain("lg:h-dvh");
    const drawerBranch = dialog.split('layout === "responsive-drawer"')[1].split(":")[0];
    expect(drawerBranch).not.toContain("-translate-x-1/2");
    expect(drawerBranch).not.toContain("-translate-y-1/2");
    expect(surface).toContain('layout="responsive-drawer"');
  });

  it("keeps the drawer header fixed while only its body scrolls", () => {
    expect(surface).toContain("shrink-0 border-b");
    expect(surface).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(surface).toContain('closeLabel={props.tt("close")}');
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
    expect(provider).toContain('{ name: "home" }');
    expect(provider).toContain('{ name: "library" }');
    expect(provider).toContain('{ name: "detail"; promptId: string; backTo: "home" | "library" }');
    expect(provider).toContain('{ name: "custom-detail" }');
    expect(surface.match(/<Dialog /g)?.length).toBe(1);
    expect(ui).toContain('name: "library"');
    expect(ui).toContain('backTo: "library"');
  });

  it("provides search, categories, availability, access and attachment states", () => {
    expect(surface).toContain('type="search"');
    expect(surface).toContain("PROMPT_CATEGORIES");
    expect(surface).toContain("getPromptAvailability");
    expect(surface).toContain('props.tt("requiresContext")');
    expect(surface).toContain("getPromptPermissionLabel");
    expect(surface).toContain('props.tt("attachmentRequired")');
    expect(surface).toContain("aria-pressed");
  });

  it("preserves editable, resettable, clipboard and ChatGPT handoff behavior", () => {
    expect(surface).toContain("<textarea");
    expect(surface).toContain("navigator.clipboard.writeText");
    expect(surface).toContain('window.open("about:blank"');
    expect(surface).toContain("setEditedPrompt(props.generatedPrompt)");
    expect(ui).not.toContain("Continue with ChatGPT");
  });

  it("keeps the corrected runtime as the provider source of truth", () => {
    expect(provider).toContain("buildRuntimePrompt");
    expect(provider).toContain("getRuntimeContextChips");
    expect(provider).toContain("RUNTIME_QUICK_PROMPTS");
    expect(provider).toContain("evaluatePromptPermission");
  });

  it("does not add or modify a migration for this UX correction", () => {
    expect(source("supabase/migration-ledger.json")).not.toContain("chatgpt_drawer_prompt_library");
  });
});
