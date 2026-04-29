"use client";

import { useState } from "react";
import { X, Server, ArrowUpRight } from "lucide-react";

export function MigrationBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Server className="h-4 w-4" />
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
            <ArrowUpRight className="h-3 w-3" />
          </a>
          <button
            onClick={() => setIsVisible(false)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/20"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
