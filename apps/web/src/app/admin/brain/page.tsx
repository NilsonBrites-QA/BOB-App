/**
 * /admin/brain — BOB Live Brain Console
 *
 * Página de visualização do grafo cognitivo do BOB em tempo real.
 * Renderiza o componente <BrainGraph> (ForceGraph2D, SSR: false)
 * sobre fundo escuro puro em modo tela cheia.
 *
 * PRD §11: "Renderização via WebGL sobre fundo escuro e painéis
 * laterais em Glassmorphism — perfil cognitivo completo da IA."
 *
 * Herda o auth pattern de /admin/cerebro (cookie Supabase + role ADMIN).
 */

import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BrainGraph } from "@/components/admin/brain-graph";
import { resolveBrainSeasonSummary } from "@/lib/admin/brain-season";

export const metadata = {
  title: "Brain Console · BOB",
  description: "Visualização interativa do grafo cognitivo do BOB Big Odds Bot",
};

export default async function AdminBrainPage() {
  // ── Autenticação / Autorização ───────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUser = user?.email
    ? await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { role: true, active: true },
      })
    : null;

  const isAdmin = currentUser?.active && currentUser.role === "ADMIN";

  if (!isAdmin) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}
      >
        <div
          style={{
            background: "rgba(2, 6, 23, 0.85)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "16px",
            padding: "2.5rem 3rem",
            color: "#e2e8f0",
            textAlign: "center",
            maxWidth: "400px",
            fontFamily:
              "var(--font-space-grotesk, 'Inter', system-ui, sans-serif)",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              marginBottom: "1rem",
              opacity: 0.6,
            }}
          >
            ⚠
          </div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#f1f5f9",
              margin: "0 0 0.5rem",
            }}
          >
            Acesso Restrito
          </h2>
          <p
            style={{
              color: "#64748b",
              fontSize: "14px",
              margin: "0 0 1.5rem",
              lineHeight: 1.6,
            }}
          >
            O Brain Console é exclusivo para administradores do BOB.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "8px 20px",
              color: "#94a3b8",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            ← Voltar ao Início
          </Link>
        </div>
      </div>
    );
  }

  // ── Brain Console (admin autenticado) ────────────────────────────────────
  const brainSeason = await resolveBrainSeasonSummary();

  return (
    <BrainGraph
      initialSeason={brainSeason.initialSeason}
      availableSeasons={brainSeason.availableSeasons}
      latestSeasonWithData={brainSeason.latestSeasonWithRounds}
    />
  );
}
