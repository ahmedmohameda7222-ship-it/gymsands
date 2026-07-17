const developmentAppUrl = process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || developmentAppUrl,
  chatgptConnectUrl: process.env.NEXT_PUBLIC_CHATGPT_CONNECT_URL || "",
  plaivraMcpServerUrl: process.env.NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL || "",
  manualChatGptSetupEnabled: process.env.NEXT_PUBLIC_ENABLE_MANUAL_CHATGPT_SETUP === "true",
  useMockAuth: process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
