"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey, { cookieOptions: authCookieOptions });
}
