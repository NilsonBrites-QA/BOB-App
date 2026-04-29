import webPackage from "../../package.json";

const rawVersion =
  typeof webPackage.version === "string" && webPackage.version.trim().length > 0
    ? webPackage.version.trim()
    : "1.1.0-beta";

export const FRONTEND_VERSION = rawVersion.startsWith("v")
  ? rawVersion
  : `v${rawVersion}`;

export const FRONTEND_SURFACE = "painel premium do apostador";

// Status da versão e migração
export const VERSION_STATUS = {
  stage: "stable-beta" as const,
  label: "Versão estável — em migração de infraestrutura",
  shortLabel: "v estável",
  migrationPhase: true,
  message: "Estamos em fase de migração de infraestrutura para entregar um produto de outro nível. Todas as funcionalidades permanecem 100% operacionais.",
};
