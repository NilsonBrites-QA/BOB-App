import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client precisa rodar no Node.js nativo, não no edge runtime
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
