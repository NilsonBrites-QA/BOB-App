"use client";

import { useEffect } from "react";

export function ThemeInit() {
  useEffect(() => {
    const stored = window.localStorage.getItem("bob-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    
    // Se há preferência salva, usa ela. Senão, usa do sistema (ou dark como padrão).
    let mode = "dark";
    if (stored === "light" || stored === "dark") {
      mode = stored;
    } else if (prefersLight) {
      mode = "light";
      window.localStorage.setItem("bob-theme", "light");
    } else {
      mode = "dark";
      window.localStorage.setItem("bob-theme", "dark");
    }

    document.documentElement.setAttribute("data-theme", mode);
  }, []);

  return null;
}
