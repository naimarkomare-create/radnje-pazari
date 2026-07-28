"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ initialMessage = "" }: { initialMessage?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setError("");
    setLoading(true);

    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || !/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      setError("Unesite ispravno korisničko ime bez @ znaka.");
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
        error: loginError
      } = await supabase.auth.signInWithPassword({
        email: `${normalizedUsername}@firma.local`,
        password
      });

      if (loginError || !user) {
        setError("Neispravni podaci za prijavu.");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setError(
          profileError.code === "PGRST116"
            ? "Nalog nema podešen profil. Proverite podešavanja u Supabase."
            : "Prijava je uspela, ali profil trenutno nije moguće učitati. Pokušajte ponovo."
        );
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      if (!profile) {
        setError("Nalog nema podešen profil. Proverite podešavanja u Supabase.");
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      setPassword("");
      router.replace(profile.role === "admin" ? "/admin" : "/store");
      router.refresh();
    } catch {
      setError("Prijava trenutno nije dostupna. Proverite vezu i pokušajte ponovo.");
      setLoading(false);
      submittingRef.current = false;
      return;
    }
  }

  return (
    <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <label className="field">
        <span className="label">Korisničko ime</span>
        <input
          className="input"
          autoCapitalize="none"
          autoComplete="username"
          name="username"
          onChange={(event) => setUsername(event.target.value)}
          required
          spellCheck={false}
          type="text"
          value={username}
        />
      </label>
      <label className="field">
        <span className="label">Lozinka</span>
        <input
          className="input"
          autoComplete="current-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="button-primary w-full" disabled={loading} type="submit">
        {loading ? "Prijavljivanje..." : "Prijava"}
      </button>
    </form>
  );
}
