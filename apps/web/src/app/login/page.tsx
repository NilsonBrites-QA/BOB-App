"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

function resolveAppOrigin() {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envOrigin) {
    return envOrigin.replace(/\/$/, "");
  }

  return window.location.origin;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enableGoogleLogin = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === "true";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const appOrigin = resolveAppOrigin();

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appOrigin}/auth/callback`,
      },
    });

    if (error) {
      setError("Não foi possível enviar o link. Verifique o e-mail e tente novamente.");
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const appOrigin = resolveAppOrigin();

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appOrigin}/auth/callback`,
      },
    });

    if (error) {
      setError("Não foi possível iniciar login Google. Confira a configuração OAuth no Supabase.");
      setLoading(false);
    }
  }

  return (
    <div className="grid-lines min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-12">
        <div className="grid w-full items-start gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="panel rounded-[30px] p-7 lg:p-8">
            <div className="flex items-center gap-4">
              <Image
                src="/bob-logo.png"
                alt="BOB"
                width={64}
                height={64}
                priority
              />
              <div>
                <p className="kicker text-xs text-muted">Sistema restrito</p>
                <h1 className="text-3xl font-bold tracking-tight">Painel BOB</h1>
              </div>
            </div>

            <p className="mt-6 text-sm leading-7 text-muted">
              Ambiente privado para análise da rodada, geração de variações e gestão de desempenho.
              Apenas contas liberadas pelo administrador conseguem concluir acesso.
            </p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Regra de acesso</p>
                <p className="mt-1 text-sm font-semibold">Whitelist ativa no painel Admin</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Método</p>
                <p className="mt-1 text-sm font-semibold">Magic link por e-mail</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Segurança</p>
                <p className="mt-1 text-sm font-semibold">Sessão curta + revisão manual de acesso</p>
              </div>
            </div>
          </section>

          <div className="w-full">
            <div className="mb-5 text-center lg:text-left">
              <p className="kicker mb-2">Acesso</p>
              <h2 className="text-2xl font-semibold">Entrar no cockpit</h2>
            </div>

            {sent ? (
              <div className="panel rounded-3xl p-8 text-center">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent-strong">OK</div>
                <h3 className="mb-2 text-xl font-semibold">Verifique seu e-mail</h3>
                <p className="text-sm leading-7 text-muted">
                  Enviamos um link de acesso para <strong className="text-foreground">{email}</strong>.
                  O link expira em 1 hora.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(""); }}
                  className="mt-6 text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  Usar outro e-mail
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="panel rounded-3xl p-8">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted">
                    E-mail corporativo
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com"
                    className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </label>

                {error && (
                  <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "Enviando..." : "Enviar link de acesso"}
                </button>

                {enableGoogleLogin && (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent disabled:opacity-50"
                  >
                    {loading ? "Redirecionando..." : "Entrar com Google"}
                  </button>
                )}

                <p className="mt-4 text-center text-xs text-muted">
                  Sem liberação prévia no Admin, o acesso será negado.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
