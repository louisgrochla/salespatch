"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) {
      setError("Invalid credentials.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
            sl-mas / intranet
          </div>
          <h1 className="font-sans text-3xl font-medium text-fg mt-1">NERVE</h1>
          <p className="font-mono text-xs text-fg-muted mt-2">
            Founder access only.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="h-section">email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-bg-panel border border-border focus:border-accent
                         text-fg font-mono text-sm px-3 py-2 outline-none"
            />
          </label>

          <label className="block">
            <span className="h-section">password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-bg-panel border border-border focus:border-accent
                         text-fg font-mono text-sm px-3 py-2 outline-none"
            />
          </label>

          {error && (
            <div className="font-mono text-xs text-status-rejected">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-fg text-bg font-sans text-sm font-medium py-2
                       hover:bg-fg-muted disabled:opacity-50 transition-colors"
          >
            {submitting ? "..." : "Authenticate"}
          </button>
        </form>
      </div>
    </main>
  );
}
