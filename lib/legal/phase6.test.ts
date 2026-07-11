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

describe("pre-launch English legal surfaces", () => {
  it("uses the supplied individual operator identity consistently", () => {
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

  it("contains no placeholders, invented organization details, or legal-approval claim", () => {
    const source = legalSource();
    expect(source).not.toMatch(/Plaivra\s+(?:GmbH|UG)|our company|our employees|our team|legal department/i);
    expect(source).not.toMatch(/Data Protection Officer|commercial register|VAT ID|\[(?:Controller|Company|Legal name|Phone|VAT)/i);
    expect(source).not.toMatch(/legally approved|approved by (?:counsel|a lawyer)/i);
    expect(source).toContain("Professional legal and privacy review is required");
  });

  it("provides full English Privacy and Terms rather than summaries", () => {
    const privacy = readFileSync("app/legal/privacy/page.tsx", "utf8");
    const terms = readFileSync("app/legal/terms/page.tsx", "utf8");
    expect(privacy).not.toContain("English summary");
    expect(terms).not.toContain("English summary");
    for (const required of [
      "Data categories", "Purposes and legal bases", "Optional ChatGPT and Plaivra tools",
      "Recipients and processors", "International transfers", "Retention",
      "Export and account deletion", "Cookies, local storage, and analytics", "Age eligibility"
    ]) expect(privacy).toContain(required);
    for (const required of [
      "Eligibility and accounts", "ChatGPT connection and authorization", "Health and medical limits",
      "Acceptable use", "Paid plans, cancellation, and refunds", "Liability", "Governing law and disputes"
    ]) expect(terms).toContain(required);
    expect(privacy).toContain("does not add a generic second approval/import queue");
    expect(privacy).toContain("Concrete periods have not yet been owner/legal approved");
    expect(terms).toContain("No paid public plan, price, subscription capability, or checkout is represented as active");
  });

  it("records material document versions without rewriting prior consent evidence", () => {
    expect(REQUIRED_CONSENTS).toEqual([
      { consent_type: "terms", version: "2026-07-11" },
      { consent_type: "privacy", version: "2026-07-11" },
      { consent_type: "fitness_data", version: "2026-07-11" },
      { consent_type: "health_disclaimer", version: "2026-07-11" },
      { consent_type: "age_16", version: "2026-07-02" }
    ]);
    const migration = readFileSync("supabase/migrations/20260711001950_legal_document_version_2026_07_11.sql", "utf8");
    expect(migration).toContain("professional_legal_review_required");
    expect(migration).toContain("Prior versions remain immutable evidence");
    expect(migration).not.toMatch(/delete\s+from\s+public\.user_consents/i);
  });
});

describe("authenticated privacy foundations", () => {
  it("requires authentication for data export and privacy-request reads/writes", async () => {
    expect((await getDataExport(new Request("https://plaivra.com/api/user/data-export"))).status).toBe(401);
    expect((await getPrivacyRequests(new Request("https://plaivra.com/api/user/privacy-requests"))).status).toBe(401);
    expect((await createPrivacyRequest(new Request("https://plaivra.com/api/user/privacy-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "deletion" })
    }))).status).toBe(401);
  });

  it("exports explicit metadata and never queries secret token/code fields", () => {
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

  it("requires app confirmation and no-delete copy for settings reset", () => {
    const source = readFileSync("app/(private)/settings/data-privacy/page.tsx", "utf8");
    expect(source).toContain("useConfirm");
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("Reset display and privacy settings?");
    expect(source).toContain("It does not delete logs, plans, meals, photos, progress, ChatGPT connections, or your account.");
    expect(source).toContain("Export failed. No file was downloaded.");
  });
});
