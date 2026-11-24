"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const requestedPath = searchParams.get("next");
      const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
      router.replace(safePath);
      router.refresh();
    } catch {
      setError("Unable to connect to Supabase. Check your environment variables and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090d14] px-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 text-xl font-bold">IH</div>
          <div>
            <h1 className="text-lg font-semibold tracking-wide">AIWITHBH@I</h1>
            <p className="text-xs text-[var(--muted)]">Owner workspace sign in</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold">Welcome back</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Sign in with the email and password you created in Supabase.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[#090d14] px-3 py-3 text-sm outline-none focus:border-cyan-500"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[#090d14] px-3 py-3 text-sm outline-none focus:border-cyan-500"
              placeholder="Enter your password"
            />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">Private access · Supabase authentication</p>
      </section>
    </main>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#090d14] px-4 text-sm text-slate-400">Loading sign-in...</main>}>
      <LoginForm />
    </Suspense>
  );
}
