"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Preencha email e senha.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("invalid") || msg.includes("credentials")) {
        setError("Email ou senha incorretos.");
      } else if (msg.includes("not confirmed")) {
        setError("Email ainda não confirmado. Verifique sua caixa de entrada.");
      } else {
        setError("Não foi possível entrar. Tente novamente em instantes.");
      }
      setLoading(false);
      return;
    }

    // Redireciona para /auth/confirm que valida whitelist
    window.location.assign("/auth/confirm?next=/dashboard");
  }

  return (
    <div className="grid-lines min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
        {/* Logo + título */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image src="/bob-logo.png" alt="BOB" width={56} height={56} priority />
          <h1 className="text-2xl font-bold tracking-tight">Painel BOB</h1>
          <p className="text-xs text-muted">Acesso restrito · whitelist do administrador</p>
        </div>

        {/* Card único */}
        <div className="panel w-full rounded-3xl p-7">
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">E-mail</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Senha</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <Link
              href="/auth/recover"
              className="text-xs font-medium text-accent-strong hover:underline"
            >
              Esqueci minha senha
            </Link>
            <p className="text-xs text-muted">
              Acesso liberado pelo administrador. Não tem conta? Solicite ao admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
