import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type ServerClient = ReturnType<typeof createClient>;

async function loadCurrentProfile(supabase: ServerClient) {
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

// React cache is request-scoped during server rendering; profiles are never shared globally.
export const getCurrentProfile = cache(async () => loadCurrentProfile(createClient()));

export function getCurrentProfileWithClient(supabase: ServerClient) {
  return loadCurrentProfile(supabase);
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
