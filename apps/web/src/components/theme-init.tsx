"use client";

import { useEffect } from "react";

export function ThemeInit() {
  useEffect(() => {
    const stored = window.localStorage.getItem("bob-theme");
    const mode = stored === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", mode);
  }, []);

  return null;
}
