/**
 * GET /api/bob/round-analysis
 * 
 * Endpoint de leitura da feature "Análises da Rodada".
 * CRÍTICO: read-only, serve dados já persistidos no banco.
 * SEM chamadas externas de API.
 * 
 * Query params:
 *   season: number (obrigatório)
 *   round: number (obrigatório)
 *   version?: number (opcional, padrão: versão mais recente)
 * 
 * Returns:
 *   200: RoundAnalysisEnvelope tipado com dados da rodada
 *   404: Nenhuma versão disponível para season/round
 *   400: Parâmetros inválidos
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { getRoundAnalysis } from "@/features/round-analysis/server/get-round-analysis";

export async function GET(req: NextRequest) {
  try {
    // ── Autenticação ───────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verifica se usuário está ativo no banco
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email!.toLowerCase() },
      select: { active: true },
    }).catch(() => null);

    if (!dbUser?.active) {
      return NextResponse.json({ error: "User not active" }, { status: 403 });
    }

    // ── Validação de parâmetros ───────────────────────────────────────────
    const { searchParams } = req.nextUrl;
    const seasonStr = searchParams.get("season");
    const roundStr = searchParams.get("round");
    const versionStr = searchParams.get("version");

    if (!seasonStr || !roundStr) {
      return NextResponse.json(
        { error: "season e round são obrigatórios" },
        { status: 400 },
      );
    }

    const season = parseInt(seasonStr, 10);
    const round = parseInt(roundStr, 10);
    const version = versionStr ? parseInt(versionStr, 10) : undefined;

    if (isNaN(season) || isNaN(round) || season < 2025 || round < 1 || round > 38) {
      return NextResponse.json(
        { error: "season e round inválidos" },
        { status: 400 },
      );
    }

    // ── Busca análise do banco (read-only) ──────────────────────────────────
    const analysis = await getRoundAnalysis({
      season,
      round,
      roundVersion: version,
      allowFallback: true, // Usa versão anterior se atual incompleta
    });

    if (!analysis) {
      return NextResponse.json(
        {
          error: "Nenhuma análise disponível para esta rodada",
          season,
          round,
        },
        { status: 404 },
      );
    }

    // ── Cache HTTP ─────────────────────────────────────────────────────────
    // Resposta autenticada por sessão — nunca pública nem cacheável por CDN.
    const headers = new Headers();
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Content-Type", "application/json");

    return NextResponse.json(analysis, { headers });
  } catch (err) {
    console.error("[GET /api/bob/round-analysis] Erro:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
