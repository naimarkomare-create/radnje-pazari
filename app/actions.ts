"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isUuid } from "@/lib/security/validation";
import { TASK_PUSH_COOKIE } from "@/lib/task-push-config";
import {
  isSupabaseAuthCookieName,
  safeAuthErrorDetails
} from "@/lib/supabase/auth-errors";

export async function signOut() {
  const supabase = createClient();
  const cookieStore = await cookies();
  const pushDevice = cookieStore.get(TASK_PUSH_COOKIE)?.value;
  if (isUuid(pushDevice)) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await createServiceClient().from("task_push_subscriptions").delete()
          .eq("id", pushDevice).eq("user_id", user.id).abortSignal(AbortSignal.timeout(3_000));
        if (error) throw error;
      }
    } catch {
      console.error("Task push device could not be removed on sign out.");
    }
    cookieStore.delete(TASK_PUSH_COOKIE);
  }
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Supabase sign out failed; clearing local auth cookies.", {
      authError: safeAuthErrorDetails(error)
    });
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
