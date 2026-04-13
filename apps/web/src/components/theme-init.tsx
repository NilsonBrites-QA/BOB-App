"use client";

import { useEffect } from "react";

export function ThemeInit() {
  useEffect(() => {
    const stored = window.localStorage.getItem("bob-theme");
    // Dark é o padrão — só usa light se o usuário explicitamente salvou "light"
    const mode = stored === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", mode);
    // Garante que o storage reflete o padrão na primeira visita
    if (!stored) window.localStorage.setItem("bob-theme", "dark");
  }, []);

  return null;
}
