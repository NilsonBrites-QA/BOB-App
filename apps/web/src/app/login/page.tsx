"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError("Não foi possível enviar o link. Verifique o e-mail e tente novamente.");
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  return (
    <div className="grid-lines min-h-screen">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo / título */}
          <div className="mb-10 text-center">
            <p className="kicker mb-3">Sistema Restrito</p>
            <h1 className="text-4xl font-bold tracking-tight">BOB</h1>
            <p className="mt-2 text-sm text-muted">Big Odds Bot</p>
          </div>

          {sent ? (
            <div className="panel rounded-3xl p-8 text-center">
              <div className="mb-4 text-3xl">✉️</div>
              <h2 className="mb-2 text-lg font-semibold">Verifique seu e-mail</h2>
              <p className="text-sm leading-7 text-muted">
                Enviamos um link de acesso para <strong className="text-foreground">{email}</strong>.
                O link expira em 1 hora.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-6 text-sm text-accent underline-offset-4 hover:underline"
              >
                Usar outro e-mail
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="panel rounded-3xl p-8">
              <h2 className="mb-6 text-lg font-semibold">Entrar</h2>

              <label className="block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted">
                  E-mail
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </label>

              {error && (
                <p className="mt-3 text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar link de acesso"}
              </button>

              <p className="mt-4 text-center text-xs text-muted">
                Acesso restrito. Apenas usuários autorizados.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
