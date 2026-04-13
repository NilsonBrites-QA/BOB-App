"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  window.localStorage.setItem("bob-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("bob-theme") === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
      aria-label={mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      title={mode === "dark" ? "Modo claro" : "Modo escuro"}
    >
      {mode === "dark" ? "Claro" : "Escuro"}
    </button>
  );
}
