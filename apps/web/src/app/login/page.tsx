"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Mode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Preencha email e senha.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Preencha email e senha.");
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        setError("Este email já está cadastrado. Use a aba 'Entrar'.");
      } else if (msg.includes("password")) {
        setError("Senha fraca. Use pelo menos 8 caracteres com letras e números.");
      } else {
        setError("Não foi possível criar a conta. Tente novamente em instantes.");
      }
      setLoading(false);
      return;
    }

    // Registra como pendente no painel admin
    await fetch("/api/auth/register-pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    }).catch(() => null);

    setNotice(
      "Conta criada! Seu acesso está aguardando aprovação do administrador. Você poderá entrar assim que for liberado.",
    );
    setLoading(false);
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
          {/* Tabs */}
          <div className="mb-6 flex rounded-xl border border-border bg-surface-strong p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "login" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "signup" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
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
              <span className="mb-1.5 block text-xs font-medium text-muted">
                Senha {mode === "signup" && <span className="opacity-60">(mínimo 8 caracteres)</span>}
              </span>
              <input
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
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

            {notice && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading
                ? mode === "login" ? "Entrando…" : "Criando…"
                : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-muted">
            {mode === "login"
              ? "Sem conta? Use 'Criar conta' acima."
              : "Após criar, aguarde aprovação do administrador."}
          </p>
        </div>
      </div>
    </div>
  );
}
