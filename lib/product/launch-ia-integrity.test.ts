import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("launch information architecture", () => {
  it("keeps exactly five primary application domains", () => {
    const shell = source("components/layout/app-shell.tsx");
    const primaryBlock = shell.match(/const primaryNavItems:[\s\S]*?\n\];/)?.[0] ?? "";

    expect(primaryBlock.match(/href:/g)).toHaveLength(5);
    expect(primaryBlock).toContain('href: "/dashboard"');
    expect(primaryBlock).toContain('href: "/my-workout/plans"');
    expect(primaryBlock).toContain('href: "/calories"');
    expect(primaryBlock).toContain('href: "/progress"');
    expect(primaryBlock).toContain('href: "/settings"');
  });

  it("does not present fabricated example metrics as product evidence", () => {
    const landing = source("app/page.tsx");

    expect(landing).not.toMatch(/ProductMetric|Calories[^\n]*620|Protein[^\n]*42g|Workout plan saved/);
    expect(landing).toContain("not sample user data");
    expect(landing).toContain("/product/plaivra-registration-mobile-2026-07-11.png");
    expect(existsSync("public/product/plaivra-registration-mobile-2026-07-11.png")).toBe(true);
  });

  it("states launch platform availability without claiming native delivery", () => {
    const landing = source("app/page.tsx");

    expect(landing).toContain("web app is the launch surface");
    expect(landing).toContain("iOS and Android apps are planned, not currently available");
    expect(landing).toContain("depends on completed platform review");
  });

  it("keeps mobile controls at least 44 CSS pixels in shared public navigation", () => {
    const sources = [
      source("components/layout/brand.tsx"),
      source("components/layout/language-switcher.tsx"),
      source("components/layout/public-footer.tsx")
    ].join("\n");

    expect(sources).toContain("min-h-11");
    expect(sources).not.toContain('className="h-8 min-h-8');
  });
});
