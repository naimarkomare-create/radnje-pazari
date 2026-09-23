import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  isConfirmedInvalidSessionError,
  safeAuthErrorDetails
} from "@/lib/supabase/auth-errors";
import type { Profile } from "@/lib/types";

type ServerClient = ReturnType<typeof createClient>;

export class AuthenticationTemporarilyUnavailableError extends Error {
  constructor() {
    super("Provera sesije trenutno nije dostupna.");
    this.name = "AuthenticationTemporarilyUnavailableError";
  }
}

async function loadCurrentProfile(supabase: ServerClient) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    if (isConfirmedInvalidSessionError(userError)) {
      return null;
    }

    console.error("Supabase authentication check temporarily failed.", {
      authError: safeAuthErrorDetails(userError)
    });
    throw new AuthenticationTemporarilyUnavailableError();
  }

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, store_id, created_at, stores(id, name)")
    .eq("id", user.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    console.error("Supabase profile lookup temporarily failed.", {
      code: error.code ?? null
    });
    throw new AuthenticationTemporarilyUnavailableError();
  }

  if (!data) {
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
    redirect("/login?reason=account_invalid");
  }

  return profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();

  if (!isValidProfileBinding(profile)) {
    redirect("/account-error");
  }

  if (profile.role !== "admin") {
    redirect("/store");
  }

  return profile;
}

export async function requireStore() {
  const profile = await requireProfile();

  if (!isValidProfileBinding(profile)) {
    redirect("/account-error");
  }

  if (profile.role !== "store") {
    redirect("/admin");
  }

  return profile;
}

export function dashboardPathFor(profile: Profile) {
  if (!isValidProfileBinding(profile)) return "/account-error";
  return profile.role === "admin" ? "/admin" : "/store";
}

export function isValidProfileBinding(
  profile: Pick<Profile, "role" | "store_id" | "stores">
) {
  if (profile.role === "admin") return profile.store_id === null;
  if (profile.role === "store") {
    if (typeof profile.store_id !== "string" || profile.store_id.length === 0) {
      return false;
    }
    if ("stores" in profile && profile.stores === null) return false;
    if (profile.stores && profile.stores.id !== profile.store_id) return false;
    return true;
  }
  return false;
}
