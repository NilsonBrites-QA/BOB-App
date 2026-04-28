/**
 * /conta/senha — Tela para o usuário (logado) trocar sua própria senha.
 *
 * Casos de uso:
 *   1. Admin que recebeu link de "password recovery" do Supabase e precisa
 *      definir uma senha (ele cai aqui já autenticado pela sessão recovery).
 *   2. Usuário comum querendo trocar a senha por escolha.
 *
 * Não exige role específico — qualquer sessão autenticada serve.
 * O Supabase aceita updateUser({ password }) usando a sessão ativa.
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { validateStrongPassword, PASSWORD_POLICY_HINT } from "@/lib/auth/password";
import { clearMustChangePassword } from "@/app/conta/actions";

export default function TrocarSenhaPage() {
  const searchParams = useSearchParams();
  const isForced = searchParams.get("forced") === "1";

  const [email, setEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Confirma sessão ao montar (caso usuário tenha caído aqui sem estar logado)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setAuthChecked(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pwdCheck = validateStrongPassword(password);
    if (!pwdCheck.ok) {
      setError(pwdCheck.reason);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError(authError.message || "Não foi possível atualizar a senha.");
      setLoading(false);
      return;
    }

    // Limpa flag mustChangePassword (não-bloqueante)
    await clearMustChangePassword().catch(() => {});

    setSuccess(true);
    setLoading(false);
    setPassword("");
    setConfirm("");
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <p className="text-sm text-muted">Carregando…</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="grid-lines min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
          <div className="panel w-full rounded-3xl p-7 text-center">
            <h1 className="mb-2 text-xl font-bold">Sessão expirada</h1>
            <p className="mb-6 text-sm text-muted">
              Você precisa estar logado para alterar a senha.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Ir para login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-lines min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Trocar senha</h1>
          <p className="mt-1 text-xs text-muted">
            Conta: <span className="font-mono">{email}</span>
          </p>
        </div>

        {isForced && !success && (
          <div className="mb-4 w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>⚠ Troca obrigatória:</strong> sua senha foi resetada por um administrador.
            Defina uma nova senha agora para continuar.
          </div>
        )}

        <div className="panel w-full rounded-3xl p-7">
          {success ? (
            <div className="space-y-4 text-center">
              <p className="rounded-xl border border-green-300 bg-green-50 px-3 py-3 text-sm text-green-800">
                ✅ Senha atualizada com sucesso.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Ir para o painel
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  Nova senha
                </span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <span className="mt-1 block text-[11px] text-muted">{PASSWORD_POLICY_HINT}</span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  Confirmar nova senha
                </span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={10}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                {loading ? "Atualizando…" : "Atualizar senha"}
              </button>
            </form>
          )}
        </div>

        <Link
          href="/dashboard"
          className="mt-4 text-xs text-muted hover:text-foreground"
        >
          ← Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
