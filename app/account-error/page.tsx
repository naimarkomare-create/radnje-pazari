import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile, isValidProfileBinding } from "@/lib/auth";

export default async function AccountErrorPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login?reason=account_invalid");
  }

  if (isValidProfileBinding(profile)) {
    redirect(profile.role === "admin" ? "/admin" : "/store");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-ink">Nalog nije pravilno podešen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Nalog nije pravilno povezan sa radnjom ili ulogom. Kontaktirajte administratora.
        </p>
        <form action={signOut} className="mt-5">
          <button className="button-secondary w-full" type="submit">
            Odjavi se
          </button>
        </form>
      </section>
    </main>
  );
}
