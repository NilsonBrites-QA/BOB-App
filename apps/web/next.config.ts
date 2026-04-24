import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client precisa rodar no Node.js nativo, não no edge runtime
  serverExternalPackages: ["@prisma/client", "prisma"],
  
  // Configuração para Tailwind CSS v4 funcionar corretamente
  turbopack: {
    resolveAlias: {
      "tailwindcss": "./node_modules/tailwindcss",
    },
  },
};

export default nextConfig;
