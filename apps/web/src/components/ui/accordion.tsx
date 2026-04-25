"use client";

import { useState, type ReactNode } from "react";

type AccordionItemProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Accordion item (sanfona) — usado para agrupar info densa.
 * Estilo Bet365: cabeçalho com chevron, conteúdo interno espaçado.
 */
export function AccordionItem({ title, subtitle, badge, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bob-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-elevated)]"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground truncate">{title}</span>
            {badge}
          </div>
          {subtitle && <div className="mt-0.5 text-xs text-muted truncate">{subtitle}</div>}
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="4 7 9 12 14 7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}

type AccordionProps = {
  children: ReactNode;
  className?: string;
};

export function Accordion({ children, className = "" }: AccordionProps) {
  return <div className={`space-y-2 ${className}`}>{children}</div>;
}
