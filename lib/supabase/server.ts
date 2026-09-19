import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createClient() {
  // Next 15 keeps synchronous request access for compatibility. Keeping this
  // wrapper synchronous avoids changing every existing Supabase call site.
  const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies;
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components cannot write cookies; middleware refreshes sessions.
        }
      }
    }
  });
}
