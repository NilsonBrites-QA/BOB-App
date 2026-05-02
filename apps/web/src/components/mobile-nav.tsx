"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS, APP_NAV_GROUPS } from "@/lib/navigation";

type MobileNavProps = {
  isAdmin?: boolean;
  signOutAction: () => Promise<void>;
};

export function MobileNav({ isAdmin, signOutAction }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  // Fecha ao navegar
  useEffect(() => { close(); }, [pathname]);

  // Bloqueia scroll do body quando menu aberto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    [
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
      isActive(href)
        ? "bg-[var(--accent)] text-black font-semibold"
        : "text-foreground hover:bg-[var(--surface-elevated)] hover:text-[var(--accent)]",
    ].join(" ");

  return (
    <div>
      {/* Hamburguer / X */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-strong)] text-foreground transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {open ? (
          /* X grande e claro */
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="17" y2="6"  />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="14" x2="17" y2="14" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Overlay com blur */}
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md"
            onClick={close}
            aria-hidden
          />

          {/* Menu Glassmorphism */}
          <div
            className="glass fixed right-3 top-[3.75rem] z-50 flex w-[min(300px,calc(100vw-1.5rem))] max-h-[calc(100vh-5rem)] flex-col overflow-y-auto rounded-2xl shadow-2xl"
            style={{ border: "1px solid var(--glass-border)" }}
          >
            {/* Cabeçalho do menu */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-xs font-bold tracking-widest uppercase text-[var(--accent)]">
                Navegação
              </span>
              <button
                onClick={close}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-foreground transition"
                aria-label="Fechar"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 space-y-3 p-3">
              {APP_NAV_GROUPS.map((group) => (
                <div key={group.id}>
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        <span className="text-base leading-none">{(item as { icon?: string }).icon ?? "›"}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div>
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-[var(--highlight)]">
                    Admin
                  </p>
                  <div className="space-y-0.5">
                    {ADMIN_NAV_ITEMS.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        <span className="text-base leading-none">{(item as { icon?: string }).icon ?? "⚙"}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            {/* Sair */}
            <div className="border-t border-[var(--border)] p-3">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--surface-elevated)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" />
                    <polyline points="11 11 14 8 11 5" />
                    <line x1="14" y1="8" x2="6" y2="8" />
                  </svg>
                  Sair da conta
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
