"use client";

import { useState } from "react";
import Link from "next/link";

type MobileNavProps = {
  isAdmin?: boolean;
  signOutAction: () => Promise<void>;
};

export function MobileNav({ isAdmin, signOutAction }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const linkClass =
    "block rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10 hover:text-accent-strong";

  return (
    <div className="md:hidden">
      {/* Hambúrguer */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:border-accent hover:text-foreground"
      >
        {open ? (
          /* X */
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="15" y2="15" />
            <line x1="15" y1="3" x2="3" y2="15" />
          </svg>
        ) : (
          /* ☰ */
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="15" y2="5" />
            <line x1="3" y1="9" x2="15" y2="9" />
            <line x1="3" y1="13" x2="15" y2="13" />
          </svg>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />

          {/* Menu panel */}
          <div className="fixed inset-x-0 top-14.25 z-40 max-h-[80vh] overflow-y-auto border-b border-border bg-surface p-4 shadow-xl">
            <nav className="space-y-1">
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Análise
              </p>
              <Link href="/dashboard" onClick={close} className={linkClass}>Dashboard</Link>
              <Link href="/estatisticas" onClick={close} className={linkClass}>Estatísticas</Link>
              <Link href="/historico" onClick={close} className={linkClass}>Histórico</Link>

              <div className="my-2 h-px bg-border" />

              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Liga
              </p>
              <Link href="/classificacao" onClick={close} className={linkClass}>Classificação</Link>
              <Link href="/calendario" onClick={close} className={linkClass}>Calendário</Link>

              <div className="my-2 h-px bg-border" />

              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Ferramentas
              </p>
              <Link href="/apostas" onClick={close} className={linkClass}>Apostas</Link>
              <Link href="/chat" onClick={close} className={linkClass}>Chat</Link>
              <Link href="/investimento-retorno" onClick={close} className={linkClass}>Investimento × Retorno</Link>

              {isAdmin && (
                <>
                  <div className="my-2 h-px bg-border" />
                  <Link href="/admin" onClick={close} className={linkClass}>Admin</Link>
                  <Link href="/admin/cerebro" onClick={close} className={linkClass}>Cérebro</Link>
                </>
              )}

              <div className="my-2 h-px bg-border" />

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-left text-sm text-muted hover:border-accent hover:text-foreground"
                >
                  Sair da conta
                </button>
              </form>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
