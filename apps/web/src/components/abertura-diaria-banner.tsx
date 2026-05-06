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
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      const now = Date.now();
      if (!last || now - parseInt(last, 10) > TTL_MS) {
        localStorage.setItem(STORAGE_KEY, String(now));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/5 px-5 py-4">
      {/* Avatar BOB */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
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
