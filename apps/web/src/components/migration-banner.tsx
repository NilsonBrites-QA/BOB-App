"use client";

import { useState } from "react";

export function MigrationBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Versão estável · Fase de migração de infraestrutura
            </p>
            <p className="text-xs leading-tight text-white/90 mt-0.5 truncate">
              Estamos evoluindo para entregar um produto de outro nível. 
              <span className="hidden sm:inline"> Funcionalidades 100% operacionais.</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/status"
            className="hidden sm:inline-flex items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-xs font-medium transition hover:bg-white/30"
          >
            Status
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
          <button
            onClick={() => setIsVisible(false)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/20"
            aria-label="Fechar aviso"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
