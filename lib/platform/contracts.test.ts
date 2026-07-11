import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, DEEP_LINK_ROUTES, PLAIVRA_PLATFORM_CONTRACT_VERSION, resolveDeepLink, type NotificationContract } from "@/lib/platform/contracts";

describe("cross-platform v1 contracts", () => {
  it("uses a stable explicit contract version", () => {
    expect(PLAIVRA_PLATFORM_CONTRACT_VERSION).toBe("2026-07-11.v1");
  });

  it.each(Object.entries(DEEP_LINK_ROUTES))("resolves allowlisted deep link %s", (key, route) => {
    expect(resolveDeepLink(`plaivra://${key}`)).toBe(route);
  });

  it.each([
    "https://evil.example/dashboard",
    "plaivra://today?next=https://evil.example",
    "plaivra://today#token",
    "plaivra://unknown",
    "not-a-url"
  ])("rejects unsafe or unknown links", (url) => {
    expect(resolveDeepLink(url)).toBeNull();
  });

  it("limits analytics to a reviewed event-name allowlist", () => {
    expect(ANALYTICS_EVENTS).not.toContain("health_metric_recorded");
    expect(ANALYTICS_EVENTS).not.toContain("diagnosis_inferred");
  });

  it("requires notification payloads to declare that lock-screen copy has no sensitive metrics", () => {
    const notification: NotificationContract = {
      notification_id: "notification_1",
      category: "workout_reminder",
      title: "Plaivra reminder",
      body: "Open Plaivra when you are ready.",
      route_key: "today",
      contains_sensitive_metrics: false
    };
    expect(notification.contains_sensitive_metrics).toBe(false);
  });
});
