import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/legal/privacy/page";
import TermsPage from "@/app/legal/terms/page";
import ImpressumPage from "@/app/legal/impressum/page";
import { GET as getDataExport } from "@/app/api/user/data-export/route";
import { GET as getPrivacyRequests, POST as createPrivacyRequest } from "@/app/api/user/privacy-requests/route";
import { LEGAL_OPERATOR } from "@/lib/legal/operator";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";

const legalFiles = [
  "app/legal/privacy/page.tsx",
  "app/legal/terms/page.tsx",
  "app/legal/impressum/page.tsx",
  "app/legal/disclaimer/page.tsx",
  "components/legal/legal-page.tsx",
  "components/layout/public-footer.tsx"
];

function legalSource() {
  return legalFiles.map((file) => readFileSync(file, "utf8")).join("\n");
}

describe("Phase 6 legal pages", () => {
  it("uses the supplied individual operator identity", () => {
    expect(LEGAL_OPERATOR).toMatchObject({
      name: "Ahmed Mohamed",
      street: "Untere Himmelreichstraße 10",
      postalCode: "94469",
      city: "Deggendorf",
      email: "Ahmed.Mohamed04@outlook.de"
    });
    expect(ImpressumPage()).toBeTruthy();
    expect(PrivacyPage()).toBeTruthy();
    expect(TermsPage()).toBeTruthy();
  });

  it("contains no research markers, placeholders, or invented organization details", () => {
    const source = legalSource();
    expect(source).not.toMatch(/cite|turn\d+(?:view|search)/i);
    expect(source).not.toMatch(/Plaivra\s+(?:GmbH|UG)|our company|our employees|our team|legal department/i);
    expect(source).not.toMatch(/Data Protection Officer|Datenschutzbeauftrag|commercial register|Handelsregister|VAT ID|USt-Id/i);
    expect(source).not.toMatch(/\[(?:Controller|Company|Legal name|Phone|VAT|Commercial register)/i);
  });

  it("explains sensitive data, ChatGPT permissions, revocation, redacted logs, and medical limits in plain language", () => {
    const privacy = readFileSync("app/legal/privacy/page.tsx", "utf8");
    const terms = readFileSync("app/legal/terms/page.tsx", "utf8");
    expect(privacy).toContain("ChatGPT-Verbindung und Berechtigungen");
    expect(privacy).toContain("ohne passende Berechtigung wird eine Aktion abgelehnt");
    expect(privacy).not.toContain("MCP");
    expect(privacy).toContain("keine rohen Prompts");
    expect(privacy).toContain("besonders schutzbedürftig");
    expect(terms).toContain("kein Medizinprodukt");
    expect(terms).toContain("Prompt-Injection");
  });

  it("records separate current versions for terms, privacy, fitness data, health notice, and age", () => {
    expect(REQUIRED_CONSENTS).toHaveLength(5);
    expect(REQUIRED_CONSENTS.every((item) => item.version === "2026-07-02")).toBe(true);
    expect(REQUIRED_CONSENTS.map((item) => item.consent_type)).toContain("age_16");

    const migration = readFileSync("supabase/migrations/20260702062000_phase6_consent_types.sql", "utf8");
    expect(migration).toContain("'age_16'");
    expect(migration).toContain("'chatgpt_connection'");
    expect(migration).toContain("'age_18'");
  });
});

describe("Phase 6 authenticated privacy foundations", () => {
  it("requires authentication for data export and privacy-request reads/writes", async () => {
    const request = new Request("https://plaivra.com/api/user/data-export");
    expect((await getDataExport(request)).status).toBe(401);
    expect((await getPrivacyRequests(new Request("https://plaivra.com/api/user/privacy-requests"))).status).toBe(401);
    expect((await createPrivacyRequest(new Request("https://plaivra.com/api/user/privacy-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "deletion" })
    }))).status).toBe(401);
  });

  it("exports only explicit connection metadata and never queries token/code tables or raw audit input", () => {
    const source = readFileSync("lib/privacy/data-export.ts", "utf8");
    expect(source).toContain("id,label,scopes,is_active,last_used_at,revoked_at,created_at,updated_at");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).not.toContain("token_hash");
    expect(source).not.toContain("mcp_oauth_access_tokens");
    expect(source).not.toContain("mcp_oauth_authorization_codes");
    expect(source).not.toContain("code_hash");
    expect(source).not.toContain("raw_prompt");
    expect(source).not.toContain('select("input');
  });

  it("requires app confirmation and no-delete copy for privacy settings reset", () => {
    const source = readFileSync("app/(private)/settings/data-privacy/page.tsx", "utf8");
    expect(source).toContain("useConfirm");
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("Reset display and privacy settings?");
    expect(source).toContain("It does not delete logs, plans, meals, photos, progress, ChatGPT connections, or your account.");
    expect(source).toContain("Export failed. No file was downloaded.");
  });
});
