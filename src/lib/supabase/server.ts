import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookieValues: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookieValues.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) => {
          cookieStore.set(name, value, options as any);
        });
      }
    }
  });
}
