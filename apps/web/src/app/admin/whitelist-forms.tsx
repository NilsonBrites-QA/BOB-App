"use client";

/**
 * AddWhitelistUserForm — Client Component
 *
 * Formulário de criação de usuário isolado do Server Component.
 * Gerencia isLoading + mensagem de feedback sem causar crash de SSR.
 *
 * Fluxo:
 *   onSubmit → chama createUserWithPassword (Server Action)
 *   sucesso  → router.refresh() para recarregar a tabela de usuários
 *   erro     → exibe message inline, sem lançar erro para o Server
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createUserWithPassword, grantUserAccess } from "./access-actions";

const PASSWORD_HINT = "Mín. 10 chars (letras + números)";

// ─── Criar com senha ──────────────────────────────────────────────────────────

export function AddWhitelistUserForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);

    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createUserWithPassword(fd);
      if (result.success) {
        setFeedback({ ok: true, msg: result.message });
        formRef.current?.reset();
        router.refresh(); // recarrega tabela de usuários sem crash de SSR
      } else {
        setFeedback({ ok: false, msg: result.message });
      }
    });
  }

  return (
    <div className="mt-5 rounded-[20px] border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="text-sm font-semibold">Criar usuário com senha</p>
      <p className="mt-1 text-xs text-muted">
        Define email + senha e libera acesso na hora. O usuário entra direto em{" "}
        <code className="rounded bg-surface-strong px-1">/login</code> sem signup.
      </p>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_auto]"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="email@exemplo.com"
          disabled={isPending}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm placeholder:text-muted disabled:opacity-50"
        />
        <input
          name="password"
          type="text"
          required
          minLength={10}
          placeholder={PASSWORD_HINT}
          disabled={isPending}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-mono placeholder:text-muted disabled:opacity-50"
        />
        <select
          name="role"
          defaultValue="VIEWER"
          disabled={isPending}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="VIEWER">VIEWER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? "Criando…" : "Criar e liberar"}
        </button>
      </form>

      {/* Feedback inline — nunca lança erro pro Server */}
      {feedback && (
        <p
          className={[
            "mt-2 rounded-lg px-3 py-2 text-xs font-medium",
            feedback.ok
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400",
          ].join(" ")}
        >
          {feedback.ok ? "✓ " : "✗ "}
          {feedback.msg}
        </p>
      )}
    </div>
  );
}

// ─── Liberar email já existente ───────────────────────────────────────────────

export function GrantAccessForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);

    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await grantUserAccess(fd);
      if (result.success) {
        setFeedback({ ok: true, msg: result.message });
        formRef.current?.reset();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: result.message });
      }
    });
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
        Apenas liberar acesso (usuário já existe no Supabase)
      </summary>
      <div className="mt-2 rounded-[20px] border border-border bg-surface-strong p-4">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email@exemplo.com"
            disabled={isPending}
            className="rounded-xl border border-border bg-transparent px-4 py-2 text-sm placeholder:text-muted disabled:opacity-50"
          />
          <select
            name="role"
            defaultValue="VIEWER"
            disabled={isPending}
            className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="VIEWER">VIEWER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Liberando…" : "Liberar acesso"}
          </button>
        </form>

        {feedback && (
          <p
            className={[
              "mt-2 rounded-lg px-3 py-2 text-xs font-medium",
              feedback.ok
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400",
            ].join(" ")}
          >
            {feedback.ok ? "✓ " : "✗ "}
            {feedback.msg}
          </p>
        )}
      </div>
    </details>
  );
}
