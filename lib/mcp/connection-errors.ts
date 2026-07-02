type ConnectionErrorPayload = {
  code?: unknown;
  error?: unknown;
};

export type ConnectionCreationErrorMessage = {
  title: string;
  description: string;
};

const fallbackMessage: ConnectionCreationErrorMessage = {
  title: "Could not create OAuth client",
  description: "Please try again. If this keeps happening, contact support."
};

export function connectionCreationErrorMessage(payload: unknown): ConnectionCreationErrorMessage {
  const data = payload && typeof payload === "object" ? payload as ConnectionErrorPayload : {};
  const code = typeof data.code === "string" ? data.code : "";
  const serverMessage = typeof data.error === "string" && data.error.trim() ? data.error.trim() : "";

  if (code === "missing_ai_permissions") {
    return {
      title: "AI permissions required",
      description: "Review and save AI Permissions before creating a ChatGPT OAuth client."
    };
  }

  if (code === "mcp_not_configured") {
    return {
      title: "ChatGPT connection unavailable",
      description: serverMessage || "ChatGPT connection setup is not configured for this deployment."
    };
  }

  if (code === "connection_rate_limited") {
    return {
      title: "Too many connection attempts",
      description: serverMessage || "Please wait a moment before trying again."
    };
  }

  if (code === "connection_rotation_failed") {
    return {
      title: "Could not create OAuth client",
      description: serverMessage || "Plaivra could not securely rotate the ChatGPT connection. Please try again."
    };
  }

  return serverMessage ? { ...fallbackMessage, description: serverMessage } : fallbackMessage;
}
