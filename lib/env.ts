export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://gymsands.vercel.app",
  chatgptConnectUrl: process.env.NEXT_PUBLIC_CHATGPT_CONNECT_URL || "",
  useMockAuth: process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
