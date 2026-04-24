"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_NAV_ITEMS, APP_NAV_GROUPS } from "@/lib/navigation";

type MobileNavProps = {
  isAdmin?: boolean;
  signOutAction: () => Promise<void>;
};

export function MobileNav({ isAdmin, signOutAction }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  const linkClass = (href: string) =>
    [
      "block rounded-2xl px-4 py-3 text-sm font-medium transition",
      pathname === href || pathname.startsWith(`${href}/`)
        ? "bg-accent text-white shadow-[0_12px_28px_rgba(21,86,61,0.22)]"
        : "bg-transparent text-foreground hover:bg-accent/10 hover:text-accent-strong",
    ].join(" ");

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
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />

          {/* Menu panel */}
          <div className="fixed inset-x-3 top-16 z-40 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-[28px] border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 rounded-[24px] border border-border/80 bg-surface px-4 py-4">
              <p className="kicker text-[10px] text-muted">Navegação</p>
              <p className="mt-2 text-base font-semibold">Painel do apostador</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                Acesse rapidamente a leitura da rodada, a liga e o console do BOB.
              </p>
            </div>

            <nav className="space-y-3">
              {APP_NAV_GROUPS.map((group) => (
                <div key={group.id} className="rounded-[24px] border border-border/80 bg-surface px-3 py-3">
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div className="rounded-[24px] border border-border/80 bg-surface px-3 py-3">
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Admin
                  </p>
                  <div className="space-y-1">
                    {ADMIN_NAV_ITEMS.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-[24px] border border-border/80 bg-surface px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Aparência</span>
                  <ThemeToggle />
                </div>
              </div>

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-[20px] border border-border px-4 py-3 text-left text-sm text-muted transition hover:border-accent hover:text-foreground"
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
