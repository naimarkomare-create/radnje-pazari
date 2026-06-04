import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getCurrentProfile() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, store_id, created_at, stores(id, name)")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as Profile;
}

export async function requireProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();

  if (profile.role !== "admin") {
    redirect("/store");
  }

  return profile;
}

export async function requireStore() {
  const profile = await requireProfile();

  if (profile.role !== "store" || !profile.store_id) {
    redirect("/admin");
  }

  return profile;
}

export function dashboardPathFor(profile: Profile) {
  return profile.role === "admin" ? "/admin" : "/store";
}
