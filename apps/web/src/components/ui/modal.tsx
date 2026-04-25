"use client";

import { useEffect, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

/**
 * Modal estilo Bet365: overlay escuro, painel central com header + corpo.
 * Fecha com Esc, clique fora ou botão X.
 */
export function Modal({ open, onClose, title, subtitle, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass =
    size === "sm" ? "max-w-md" :
    size === "lg" ? "max-w-3xl" :
    size === "xl" ? "max-w-5xl" :
    "max-w-xl";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`w-full ${sizeClass} max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-strong)] shadow-2xl flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="flex-1 min-w-0">
              {title && <h2 className="text-base font-bold text-foreground">{title}</h2>}
              {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-elevated)] hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="3" x2="15" y2="15" />
                <line x1="15" y1="3" x2="3" y2="15" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
