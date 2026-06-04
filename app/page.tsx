import { redirect } from "next/navigation";
import { dashboardPathFor, getCurrentProfile } from "@/lib/auth";

export default async function HomePage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect(dashboardPathFor(profile));
}
