import { describe, expect, it } from "vitest";
import { connectionCreationErrorMessage } from "./connection-errors";

describe("ChatGPT connection creation error classification", () => {
  it("shows the permissions action only for the explicit backend code", () => {
    expect(connectionCreationErrorMessage({ code: "missing_ai_permissions", error: "denied" })).toEqual({
      title: "AI permissions required",
      description: "Review and save AI Permissions before creating a ChatGPT OAuth client."
    });
  });

  it("does not mislabel an unrelated conflict as missing permissions", () => {
    expect(connectionCreationErrorMessage({ error: "An active connection already exists." })).toEqual({
      title: "Could not create OAuth client",
      description: "An active connection already exists."
    });
  });

  it("distinguishes deployment configuration, rate-limit, and rotation failures", () => {
    expect(connectionCreationErrorMessage({ code: "mcp_not_configured" }).title).toBe("ChatGPT connection unavailable");
    expect(connectionCreationErrorMessage({ code: "connection_rate_limited" }).title).toBe("Too many connection attempts");
    expect(connectionCreationErrorMessage({ code: "connection_rotation_failed" }).title).toBe("Could not create OAuth client");
  });
});
