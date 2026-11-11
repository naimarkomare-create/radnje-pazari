import { redirect } from "next/navigation";
import { dashboardPathFor, getCurrentProfile } from "@/lib/auth";
import { LoginForm } from "@/app/login/LoginForm";
import { isUuid } from "@/lib/security/validation";

export default async function LoginPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ reason?: string; task?: string }>;
}) {
  const searchParams = searchParamsPromise ? await searchParamsPromise : undefined;
  const profile = await getCurrentProfile();
  const taskId = isUuid(searchParams?.task) ? searchParams.task : undefined;

  if (profile) {
    const destination = dashboardPathFor(profile);
    redirect(destination === "/store" && taskId ? `/store?task=${taskId}#task-${taskId}` : destination);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-leaf">Interna aplikacija</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Prijava</h1>
        </div>
        <LoginForm
          taskId={taskId}
          initialMessage={
            searchParams?.reason === "session_expired"
              ? "Sesija je istekla. Prijavite se ponovo."
              : searchParams?.reason === "account_invalid"
                ? "Nalog nije pravilno podešen. Kontaktirajte administratora."
              : ""
          }
        />
      </div>
    </main>
  );
}
