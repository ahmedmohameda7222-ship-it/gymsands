import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("next.config.mjs", "utf8");

describe("production security headers", () => {
  it("allows only the browser resources Plaivra currently uses", () => {
    expect(source).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(source).toContain("https://images.unsplash.com");
    expect(source).toContain("frame-src https://www.youtube.com https://player.vimeo.com");
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).not.toContain("connect-src *");
    expect(source).not.toContain("frame-src *");
    expect(source).not.toContain("'unsafe-eval'");
  });

  it("keeps clickjacking, referrer, feature, and MIME protections", () => {
    expect(source).toContain('key: "X-Frame-Options"');
    expect(source).toContain('value: "DENY"');
    expect(source).toContain('key: "Referrer-Policy"');
    expect(source).toContain('value: "strict-origin-when-cross-origin"');
    expect(source).toContain('key: "X-Content-Type-Options"');
    expect(source).toContain("camera=()");
    expect(source).toContain('process.env.NODE_ENV === "production"');
  });
});
