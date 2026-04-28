/**
 * /auth/recover — "Esqueci minha senha"
 *
 * User digita email → server action chama Supabase generateLink(recovery).
 * Por segurança, sempre mostra "se o email existir, enviaremos instruções"
 * (não revela se o email está cadastrado — protege contra enumeration).
 *
 * O email contém link para /auth/confirm que valida sessão e redireciona
 * para /conta/senha onde o user define nova senha.
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/admin/access-actions";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email.trim().toLowerCase());
    startTransition(async () => {
      try {
        await requestPasswordReset(fd);
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar.");
      }
    });
  }

  return (
    <div className="grid-lines min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image src="/bob-logo.png" alt="BOB" width={56} height={56} priority />
          <h1 className="text-2xl font-bold tracking-tight">Recuperar acesso</h1>
          <p className="text-xs text-muted">Enviaremos um link para definir nova senha</p>
        </div>

        <div className="panel w-full rounded-3xl p-7">
          {submitted ? (
            <div className="space-y-4 text-center">
              <p className="rounded-xl border border-green-300 bg-green-50 px-3 py-3 text-sm text-green-800">
                Se este email estiver cadastrado, enviaremos um link de recuperação em instantes.
                Verifique sua caixa de entrada (e spam).
              </p>
              <Link
                href="/login"
                className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Seu e-mail cadastrado</span>
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

              {error && (
                <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Enviar link de recuperação"}
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-5 block text-center text-xs text-muted hover:text-foreground"
          >
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}
