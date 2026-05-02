/**
 * /conta — Gestão de Perfil do Usuário
 *
 * Página completa de gerenciamento de conta:
 *   - Ver dados do perfil (email, role, status)
 *   - Trocar senha (via Supabase auth.updateUser)
 *   - Informações de segurança
 *
 * Acessível por qualquer usuário autenticado.
 * Se vier com ?forced=1 (reset forçado), exibe aviso especial.
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { validateStrongPassword, PASSWORD_POLICY_HINT } from "@/lib/auth/password";
import { clearMustChangePassword } from "@/app/conta/actions";

type TabId = "perfil" | "senha" | "seguranca";

export default function ContaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isForced = searchParams.get("forced") === "1";

  const [tab, setTab] = useState<TabId>(isForced ? "senha" : "perfil");
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Senha
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setEmail(user?.email ?? null);
      // Tenta pegar o role do metadata ou usa padrão
      const meta = user?.user_metadata as Record<string, unknown> | undefined;
      setRole((meta?.role as string) ?? "VIEWER");
      setAuthChecked(true);
    });
  }, []);

  async function handleSenha(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pwdCheck = validateStrongPassword(password);
    if (!pwdCheck.ok) { setError(pwdCheck.reason); return; }
    if (password !== confirm) { setError("As senhas não conferem."); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError(authError.message || "Não foi possível atualizar a senha.");
      setLoading(false);
      return;
    }

    await clearMustChangePassword().catch(() => {});
    setSuccess(true);
    setLoading(false);
    setPassword("");
    setConfirm("");

    // Após reset forçado, redireciona ao dashboard em 2s
    if (isForced) {
      setTimeout(() => router.push("/dashboard"), 2000);
    }
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="grid-lines min-h-screen flex items-center justify-center px-6">
        <div className="panel w-full max-w-md rounded-3xl p-8 text-center space-y-4">
          <span className="text-4xl">🔒</span>
          <h1 className="text-xl font-bold">Sessão expirada</h1>
          <p className="text-sm text-muted">Você precisa estar logado para acessar esta página.</p>
          <Link href="/login" className="btn-primary block text-center">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "perfil",   label: "Perfil",    icon: "👤" },
    { id: "senha",    label: "Senha",     icon: "🔑" },
    { id: "seguranca", label: "Segurança", icon: "🛡" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10 max-w-2xl mx-auto w-full">

      {/* Hero */}
      <section>
        <p className="kicker text-xs text-muted">Minha conta</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">
          Gestão de <span className="text-accent">Perfil</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Gerencie seu acesso, senha e informações de segurança.
        </p>
      </section>

      {/* Banner forçado */}
      {isForced && !success && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-4">
          <p className="text-sm font-semibold text-amber-700">⚠ Troca de senha obrigatória</p>
          <p className="mt-1 text-xs text-amber-700/80">
            Sua senha foi resetada por um administrador. Defina uma nova senha para continuar usando o BOB.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border/60 bg-surface-strong p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(null); setSuccess(false); }}
            className={[
              "flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all",
              tab === t.id
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Perfil ─────────────────────────────────────────── */}
      {tab === "perfil" && (
        <div className="panel rounded-3xl p-6 space-y-5">
          <h2 className="text-sm font-semibold">Dados da conta</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-strong px-4 py-3">
              <span className="text-xs text-muted">E-mail</span>
              <span className="font-mono text-sm font-medium">{email}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-strong px-4 py-3">
              <span className="text-xs text-muted">Perfil de acesso</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                role === "ADMIN"
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-700"
                  : "border-accent/30 bg-accent/10 text-accent-strong"
              }`}>
                {role ?? "VIEWER"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-strong px-4 py-3">
              <span className="text-xs text-muted">Status</span>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold text-accent-strong">
                ✓ Ativo
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <p className="text-xs text-muted">
              Para alterar e-mail ou solicitar exclusão de conta, entre em contato com o administrador do BOB.
            </p>
          </div>
        </div>
      )}

      {/* ── Tab: Senha ──────────────────────────────────────────── */}
      {tab === "senha" && (
        <div className="panel rounded-3xl p-6">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <span className="text-5xl">✅</span>
              <p className="text-sm font-semibold text-accent-strong">Senha atualizada com sucesso!</p>
              <p className="text-xs text-muted">
                {isForced ? "Redirecionando para o painel…" : "Sua nova senha já está ativa."}
              </p>
              {!isForced && (
                <Link href="/dashboard" className="inline-flex rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
                  Ir para o painel
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleSenha} className="space-y-5">
              <h2 className="text-sm font-semibold">Alterar senha</h2>

              {/* Nova senha */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Nova senha</span>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    minLength={10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
                  >
                    {showPwd ? "ocultar" : "ver"}
                  </button>
                </div>
                <span className="mt-1 block text-[11px] text-muted">{PASSWORD_POLICY_HINT}</span>
              </label>

              {/* Confirmar senha */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Confirmar nova senha</span>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    minLength={10}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••••"
                    className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 pr-10 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
                  >
                    {showConfirm ? "ocultar" : "ver"}
                  </button>
                </div>
              </label>

              {/* Indicador de força */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="h-1 w-full rounded-full bg-border/40">
                    <div
                      className={`h-1 rounded-full transition-all ${
                        password.length >= 14 ? "bg-accent w-full" :
                        password.length >= 10 ? "bg-signal w-2/3" :
                        "bg-red-500 w-1/3"
                      }`}
                    />
                  </div>
                  <p className="text-[10px] text-muted">
                    {password.length >= 14 ? "Senha forte ✓" :
                     password.length >= 10 ? "Senha aceitável" :
                     "Senha fraca — mínimo 10 caracteres"}
                  </p>
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || password.length < 10 || password !== confirm}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "Atualizando…" : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Tab: Segurança ──────────────────────────────────────── */}
      {tab === "seguranca" && (
        <div className="panel rounded-3xl p-6 space-y-4">
          <h2 className="text-sm font-semibold">Segurança da conta</h2>

          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-surface-strong px-4 py-3">
              <p className="text-xs font-medium">Autenticação</p>
              <p className="mt-1 text-xs text-muted">Email + senha com confirmação Supabase Auth.</p>
            </div>

            <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
              <p className="text-xs font-medium text-accent-strong">🔒 Link de reset seguro</p>
              <p className="mt-1 text-xs text-muted">
                Links de recuperação de senha são válidos por 1 hora, de uso único, e invalidam a senha antiga automaticamente.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-surface-strong px-4 py-3">
              <p className="text-xs font-medium">Dicas de segurança</p>
              <ul className="mt-2 space-y-1 text-xs text-muted list-disc list-inside">
                <li>Use uma senha única para o BOB</li>
                <li>Mínimo 10 caracteres com letras e números</li>
                <li>Não compartilhe suas credenciais</li>
                <li>Troque a senha periodicamente</li>
              </ul>
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <button
              onClick={() => setTab("senha")}
              className="text-xs text-accent hover:underline"
            >
              Trocar senha agora →
            </button>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/dashboard" className="text-xs text-muted hover:text-foreground transition">
          ← Voltar ao painel
        </Link>
        {role === "ADMIN" && (
          <Link href="/admin" className="text-xs text-accent hover:underline">
            Painel Admin →
          </Link>
        )}
      </div>
    </div>
  );
}
