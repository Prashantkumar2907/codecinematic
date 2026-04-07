const requiredPublic = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export function getPublicEnv() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  };
}

export function hasSupabaseEnv() {
  const current = getPublicEnv();
  return requiredPublic.every((key) => {
    const value = process.env[key];
    return Boolean(value && !value.startsWith("YOUR_"));
  }) && Boolean(current.supabaseUrl && current.supabaseAnonKey);
}
