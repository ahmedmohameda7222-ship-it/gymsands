import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protectedRoute = readFileSync(
  resolve(process.cwd(), "components/auth/protected-route.tsx"),
  "utf8",
);
const consentCompletion = readFileSync(
  resolve(process.cwd(), "components/auth/consent-completion-client.tsx"),
  "utf8",
);
const onboardingForm = readFileSync(
  resolve(process.cwd(), "components/onboarding/adaptive-onboarding-form.tsx"),
  "utf8",
);

describe("PCS-2 route consumers", () => {
  it("keeps ProtectedRoute deterministic and database-free", () => {
    expect(protectedRoute).toContain("resolvePrivateRouteGate");
    expect(protectedRoute).not.toContain("getOnboarding");
    expect(protectedRoute).not.toContain("hasRequiredConsents");
    expect(protectedRoute).not.toContain("checkUserLaunchEligibility");
    expect(protectedRoute).not.toContain("@/lib/supabase/client");
    expect(protectedRoute).not.toContain("window.location.reload");
    expect(protectedRoute).toContain("refreshBootstrap");
    expect(protectedRoute.match(/useEffect\(/g)).toHaveLength(1);
  });

  it("refreshes bootstrap after consent persistence before navigation", () => {
    const saveIndex = consentCompletion.indexOf(
      "await saveRequiredConsents(session.access_token, ageResult.data);",
    );
    const refreshIndex = consentCompletion.indexOf("await refreshBootstrap();");
    const navigationIndex = consentCompletion.indexOf(
      "router.replace(next);",
      refreshIndex,
    );
    expect(saveIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(saveIndex);
    expect(navigationIndex).toBeGreaterThan(refreshIndex);
    expect(consentCompletion).not.toContain(
      'from "@/services/database/consents"',
    );
    expect(consentCompletion).not.toContain("await hasRequiredConsents(");
  });

  it("awaits onboarding bootstrap refresh before destination navigation", () => {
    const refreshIndex = onboardingForm.indexOf("await refreshProfile();");
    const navigationIndex = onboardingForm.indexOf(
      'router.push(editMode ? safeReturnTo : "/dashboard")',
      refreshIndex,
    );
    expect(refreshIndex).toBeGreaterThan(-1);
    expect(navigationIndex).toBeGreaterThan(refreshIndex);
  });
});
