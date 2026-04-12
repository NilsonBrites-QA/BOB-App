"use client";

/**
 * BOB — Banner de Abertura Diária
 *
 * Exibe a saudação do BOB na primeira visita em 24h.
 * Usa localStorage para controle de exibição.
 * Fecha automaticamente após 8s ou ao clicar no X.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "bob-last-greeting";
const TTL_MS      = 24 * 60 * 60 * 1000; // 24h

type Props = { message: string };

export function AberturaDiariaBanner({ message }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      const now  = Date.now();
      if (!last || now - parseInt(last, 10) > TTL_MS) {
        setVisible(true);
        localStorage.setItem(STORAGE_KEY, String(now));
        // Auto-dismiss após 8s
        const t = setTimeout(() => setVisible(false), 8000);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage indisponível
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-5 py-4">
      {/* Avatar BOB */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
        B
      </div>
      {/* Mensagem */}
      <p className="flex-1 text-sm leading-6 text-foreground">
        {message}
      </p>
      {/* Fechar */}
      <button
        onClick={() => setVisible(false)}
        className="mt-0.5 shrink-0 rounded-full p-1 text-muted hover:text-foreground"
        aria-label="Dispensar"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
