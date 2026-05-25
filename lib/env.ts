const hardcodedSupabaseUrl = "";
const hardcodedSupabaseAnonKey = "";
const hardcodedAppUrl = "";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || hardcodedSupabaseUrl,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || hardcodedSupabaseAnonKey,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || hardcodedAppUrl,
  useMockAuth: process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
