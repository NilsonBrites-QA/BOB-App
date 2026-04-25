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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    [
      "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
      isActive(href)
        ? "bg-[var(--accent)] text-white"
        : "text-foreground hover:bg-[var(--surface-elevated)]",
    ].join(" ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-strong)] text-foreground hover:bg-[var(--surface-elevated)]"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="15" y2="15" />
            <line x1="15" y1="3" x2="3" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="15" y2="5" />
            <line x1="3" y1="9" x2="15" y2="9" />
            <line x1="3" y1="13" x2="15" y2="13" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />

          <div className="fixed right-3 top-14 z-40 w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-strong)] p-3 shadow-2xl">
            <nav className="space-y-3">
              {APP_NAV_GROUPS.map((group) => (
                <div key={group.id}>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Admin
                  </p>
                  <div className="space-y-0.5">
                    {ADMIN_NAV_ITEMS.map((item) => (
                      <Link key={item.href} href={item.href} onClick={close} className={linkClass(item.href)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between rounded-lg px-3 py-2">
                  <span className="text-sm text-muted">Aparência</span>
                  <ThemeToggle />
                </div>
              </div>

              <form action={signOutAction} className="border-t border-[var(--border)] pt-3">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--surface-elevated)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" />
                    <polyline points="11 11 14 8 11 5" />
                    <line x1="14" y1="8" x2="6" y2="8" />
                  </svg>
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
