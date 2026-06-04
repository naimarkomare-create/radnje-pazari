import { redirect } from "next/navigation";
import { dashboardPathFor, getCurrentProfile } from "@/lib/auth";
import { LoginForm } from "@/app/login/LoginForm";

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect(dashboardPathFor(profile));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-leaf">Interna aplikacija</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Prijava</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
