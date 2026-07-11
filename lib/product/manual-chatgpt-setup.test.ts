import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("temporary ChatGPT Developer Mode setup", () => {
  const component = source("components/settings/connected-apps.tsx");
  const settingsPage = source("app/(private)/settings/connections/page.tsx");
  const setupPage = source("app/(private)/settings/connections/chatgpt/page.tsx");
  const environment = source("lib/env.ts");
  const environmentExample = source(".env.example");
  const oauthRegistrationRoute = source("app/api/oauth/register/route.ts");
  const mcpRoute = source("app/api/mcp/route.ts");

  it("is controlled by one public feature flag and is hidden by default", () => {
    expect(environment).toContain(
      'manualChatGptSetupEnabled: process.env.NEXT_PUBLIC_ENABLE_MANUAL_CHATGPT_SETUP === "true"'
    );
    expect(environmentExample).toContain("NEXT_PUBLIC_ENABLE_MANUAL_CHATGPT_SETUP=false");
    expect(settingsPage).toContain("env.manualChatGptSetupEnabled ? <TemporaryChatGptDeveloperSetupCard /> : null");
    expect(setupPage).toContain(
      "env.manualChatGptSetupEnabled ? <TemporaryChatGptDeveloperSetupCard /> : <ChatGptSetupFlow />"
    );
  });

  it("renders the exact developer metadata from the public MCP URL", () => {
    expect(component).toContain("export function TemporaryChatGptDeveloperSetupCard()");
    expect(component).toContain('const CHATGPT_DEVELOPER_APP_NAME = "Plaivra"');
    expect(component).toContain(
      "Use Plaivra to create, store, track, and update personalized workouts, meal plans, nutrition, hydration, wellness, and progress."
    );
    expect(component).toContain("const mcpServerUrl = env.plaivraMcpServerUrl.trim()");
    expect(component).not.toContain("PLAIVRA_MCP_TOKEN_SECRET");
  });

  it("copies each value with accessible feedback and preserves manual selection", () => {
    expect(component).toContain("navigator.clipboard.writeText(value)");
    expect(component).toContain('copyLabel="App name copied"');
    expect(component).toContain('copyLabel="Description copied"');
    expect(component).toContain('copyLabel="MCP server URL copied"');
    expect(component).toContain('title: "Copy failed"');
    expect(component).toContain("select-text");
    expect(component).toContain('aria-label={`Copy ${label}`}');
  });

  it("handles a missing public MCP URL without exposing a fallback", () => {
    expect(component).toContain("The public Plaivra MCP server URL is not configured.");
    expect(component).toContain('aria-label="Copy MCP server URL"');
    expect(component).toMatch(/aria-label="Copy MCP server URL"[\s\S]*?disabled/);
    expect(component).not.toContain("PLAIVRA_MCP_BASE_URL");
    expect(component).not.toContain("PLAIVRA_MCP_ALLOWED_ORIGINS");
  });

  it("does not show the published setup card at the same time", () => {
    expect(settingsPage).toContain(
      "!env.manualChatGptSetupEnabled ? <ChatGptSetupCard /> : null"
    );
    expect(component).toContain(
      "env.manualChatGptSetupEnabled ? <TemporaryChatGptDeveloperSetupCard /> : <ChatGptSetupCard />"
    );
  });

  it("preserves status, permissions, revocation, activity, and the future setup flow", () => {
    expect(settingsPage).toContain("<ChatGptConnectionStatusHero />");
    expect(settingsPage).toContain("<AiPermissionsCard />");
    expect(settingsPage).toContain("<ConnectionStatusCard />");
    expect(settingsPage).toContain("<ChatGptActivityCard />");
    expect(component).toContain("export function ChatGptSetupFlow()");
    expect(component).toContain("Revoke connection");
    expect(component).toContain("Recent ChatGPT activity");
  });

  it("keeps the feature flag out of OAuth and MCP backend routes", () => {
    expect(oauthRegistrationRoute).toContain("return handleOAuthRegister();");
    expect(oauthRegistrationRoute).not.toContain("manualChatGptSetupEnabled");
    expect(mcpRoute).toContain("return handleMcpPost(request);");
    expect(mcpRoute).not.toContain("manualChatGptSetupEnabled");
  });

  it("opens ChatGPT plugins without claiming a successful connection", () => {
    expect(component).toContain('href="https://chatgpt.com/plugins"');
    expect(component).toContain('target="_blank"');
    expect(component).toContain('rel="noreferrer"');
    expect(component).not.toContain("Connection successful");
  });
});
