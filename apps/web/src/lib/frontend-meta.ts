import webPackage from "../../package.json";

const rawVersion =
  typeof webPackage.version === "string" && webPackage.version.trim().length > 0
    ? webPackage.version.trim()
    : "1.1.0-beta";

export const FRONTEND_VERSION = rawVersion.startsWith("v")
  ? rawVersion
  : `v${rawVersion}`;

export const FRONTEND_SURFACE = "painel premium do apostador";
