"use client";

/**
 * Componente de ações inline por linha de usuário no /admin.
 *
 * Encapsula:
 *   - Botão "Resetar senha" → modal com input de senha temporária
 *   - Botão "Deletar" → confirmação dupla
 *
 * Server actions retornam ActionResult (nunca lançam erro).
 * Isso evita Server Component Crash ao exibir mensagens de falha.
 */

import { useState, useTransition } from "react";
import type { ActionResult } from "./access-actions";

type Props = {
  userId: string;
  userEmail: string;
  isPrimary: boolean;
  resetAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
};

export function UserActionsRow({ userId, userEmail, isPrimary, resetAction, deleteAction }: Props) {
  type ResetMode = "link" | "temporary";

  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resetMode, setResetMode] = useState<ResetMode>("link");
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generateRandomPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 12; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewPassword(out);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("mode", resetMode);
    if (resetMode === "temporary") {
      fd.set("newPassword", newPassword);
    }
    startTransition(async () => {
      const result = await resetAction(fd);
      if (result.success) {
        setShowReset(false);
        setNewPassword("");
        setResetMode("link");
      } else {
        setError(result.message);
      }
    });
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (deleteConfirm !== userEmail) {
      setError(`Digite o email completo (${userEmail}) para confirmar.`);
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const result = await deleteAction(fd);
      if (result.success) {
        setShowDelete(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Reset — admin principal só aparece o botão para si mesmo (self-reset) */}
      <button
        type="button"
        onClick={() => { setShowReset(true); setError(null); }}
        disabled={pending}
        className="rounded-lg border border-amber-400 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
        title="Resetar senha"
      >
        🔑 Reset
      </button>

      <button
        type="button"
        onClick={() => { setShowDelete(true); setError(null); }}
        disabled={isPrimary || pending}
        className="rounded-lg border border-red-400 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        title={isPrimary ? "Admin principal não pode ser deletado" : "Deletar usuário"}
      >
        🗑 Deletar
      </button>

      {/* Modal RESET */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleReset}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div>
              <h3 className="text-lg font-semibold">Resetar senha</h3>
              <p className="mt-1 text-xs text-muted">
                Conta: <strong>{userEmail}</strong>
              </p>
            </div>

            {/* Seletor de modo */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-muted">Como resetar?</span>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs transition ${
                    resetMode === "link"
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-border hover:bg-surface-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    value="link"
                    checked={resetMode === "link"}
                    onChange={() => setResetMode("link")}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block font-semibold text-foreground">
                      🔗 Enviar link &quot;Criar nova senha&quot;{" "}
                      <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                        recomendado
                      </span>
                    </span>
                    <span className="mt-0.5 block text-muted">
                      Usuário recebe email com link, define a própria senha. Senha nunca trafega
                      em texto. Link expira em 1h.
                    </span>
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs transition ${
                    resetMode === "temporary"
                      ? "border-amber-500 bg-amber-50"
                      : "border-border hover:bg-surface-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="resetMode"
                    value="temporary"
                    checked={resetMode === "temporary"}
                    onChange={() => setResetMode("temporary")}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block font-semibold text-foreground">
                      🔑 Definir senha temporária
                    </span>
                    <span className="mt-0.5 block text-muted">
                      Você digita a senha; vai por email + você pode comunicar fora do app
                      (telefone, etc). Senha trafega visível.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Campo de senha (apenas no modo temporary) */}
            {resetMode === "temporary" && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted">Senha temporária</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 10 chars (1 letra + 1 número)"
                    className="flex-1 rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-strong"
                    title="Gerar senha aleatória"
                  >
                    ⚙ Gerar
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  O usuário será forçado a trocar essa senha no próximo login.
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                disabled={pending}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-strong"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || (resetMode === "temporary" && newPassword.length < 10)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  resetMode === "link"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {pending
                  ? "Resetando…"
                  : resetMode === "link"
                  ? "Enviar link de reset"
                  : "Resetar senha"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal DELETE */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleDelete}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div>
              <h3 className="text-lg font-semibold text-red-700">⚠ Deletar usuário</h3>
              <p className="mt-1 text-xs text-muted">
                Operação <strong>irreversível</strong>. Remove de Supabase Auth + banco do app.
              </p>
            </div>

            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
              <p className="text-red-900">Será deletado:</p>
              <p className="mt-1 font-mono text-xs">{userEmail}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted">
                Para confirmar, digite o email completo:
              </label>
              <input
                type="text"
                required
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={userEmail}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                disabled={pending}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-strong"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || deleteConfirm !== userEmail}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Deletando…" : "Deletar permanentemente"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
