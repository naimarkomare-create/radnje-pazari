"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseAuthCookieName,
  safeAuthErrorDetails
} from "@/lib/supabase/auth-errors";

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Supabase sign out failed; clearing local auth cookies.", {
      authError: safeAuthErrorDetails(error)
    });
    const cookieStore = cookies();
    cookieStore
      .getAll()
      .filter((cookie) => isSupabaseAuthCookieName(cookie.name))
      .forEach((cookie) => {
        cookieStore.set({
          name: cookie.name,
          value: "",
          maxAge: 0,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production"
        });
      });
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
