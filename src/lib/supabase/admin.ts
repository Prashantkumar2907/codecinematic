import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

export function hasSupabaseAdminEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(serviceRoleKey && !serviceRoleKey.startsWith("YOUR_"));
}

export function createSupabaseAdminClient() {
  const env = getPublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env.supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith("YOUR_")) {
    return null;
  }

  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
