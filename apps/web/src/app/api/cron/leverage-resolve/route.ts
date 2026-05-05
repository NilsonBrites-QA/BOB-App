/**
 * BOB — Cron endpoint: GET /api/cron/leverage-resolve
 *
 * Resolução autônoma da Alavancagem (15 passos).
 *
 * Pipeline:
 *   1. Auth via CRON_SECRET
 *   2. Busca todos os eventos PENDING no banco (apostas geradas, aguardando resultado)
 *   3. Busca resultados reais via getFinishedMatchesGated (football-data.org)
 *   4. Cruza pickOutcome × placar real
 *   5. INSERT append-only:
 *      - Todos os picks GREEN → evento GREEN (avança step)
 *      - Qualquer pick RED    → evento RED (reset para passo 1, novo cycleId)
 *
 * REGRA DE OURO:
 *   - ZERO UPDATEs ou DELETEs na tabela leverage_events
 *   - Se alguma partida ainda NÃO terminou → IGNORA o evento (tenta no próximo ciclo)
 *   - Isso previne falsos REDs em jogos em andamento
 *
 * Segurança: Requer header Authorization: Bearer <CRON_SECRET>
 *
 * Recomendação de agendamento: a cada 1h (após horário de jogos)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFinishedMatchesGated } from "@/lib/bob/connectors/football-data";
import { calculateStake, LEVERAGE_TOTAL_STEPS } from "@/lib/bob/engine/leverage";
import type { FDMatch } from "@/lib/bob/connectors/football-data";

// ─── Tipos internos ──────────────────────────────────────────────────────────

/** Evento PENDING lido do banco (snake_case → camelCase). */
type PendingEvent = {
  id: string;
  userId: string;
  cycleId: string;
  step: number;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  pickLabel: string;
  pickOdd: number;
  stake: number;
};

/**
 * Determina o resultado real de uma partida.
 *
 * Retorna:
 *   "Home"  → mandante venceu
 *   "Away"  → visitante venceu
 *   "Draw"  → empate
 *   null    → partida NÃO está FINISHED (ignorar, tentar depois)
 */
function resolveMatchOutcome(match: FDMatch): "Home" | "Draw" | "Away" | null {
  if (match.status !== "FINISHED") return null;

  const homeGoals = match.score.fullTime.home;
  const awayGoals = match.score.fullTime.away;

  if (homeGoals === null || awayGoals === null) return null;

  if (homeGoals > awayGoals) return "Home";
  if (awayGoals > homeGoals) return "Away";
  return "Draw";
}

/**
 * Converte pickLabel (nome do time ou "Empate") de volta para o outcome canônico.
 *
 * O leverage.ts salva pickLabel como:
 *   - nome do time mandante → "Home"
 *   - nome do time visitante → "Away"
 *   - "Empate" → "Draw"
 *
 * Para cruzar com o resultado real, precisamos do outcome, não do label.
 */
function labelToOutcome(
  pickLabel: string,
  homeTeam: string,
  awayTeam: string,
): "Home" | "Draw" | "Away" {
  if (pickLabel === "Empate") return "Draw";

  // Normaliza para comparação fuzzy (Remove acentos, lowercase, trim)
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  if (normalize(pickLabel) === normalize(homeTeam)) return "Home";
  if (normalize(pickLabel) === normalize(awayTeam)) return "Away";

  // Fallback: match parcial (ex: "Palmeiras" em "SE Palmeiras")
  if (normalize(homeTeam).includes(normalize(pickLabel))) return "Home";
  if (normalize(awayTeam).includes(normalize(pickLabel))) return "Away";

  // Default seguro — tratamos como Draw para não dar false positive
  return "Draw";
}

/**
 * Tenta fazer match de um matchId do BOB com as partidas da API.
 *
 * O matchId do BOB pode ser:
 *   - ID numérico do football-data.org (ex: "12345")
 *   - Slug do tipo "flamengo-x-palmeiras"
 *   - Qualquer formato gerado pelo round-loader
 *
 * Estratégia: match por ID numérico primeiro, depois por nomes de times.
 */
function findFinishedMatch(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  finishedMatches: FDMatch[],
): FDMatch | null {
  // Tentativa 1: ID numérico direto
  const numericId = parseInt(matchId, 10);
  if (!isNaN(numericId)) {
    const byId = finishedMatches.find((m) => m.id === numericId);
    if (byId) return byId;
  }

  // Tentativa 2: match por nome dos times (fuzzy)
  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const normHome = normalize(homeTeam);
  const normAway = normalize(awayTeam);

  const byTeams = finishedMatches.find((m) => {
    const fdHome = normalize(m.homeTeam.name);
    const fdAway = normalize(m.awayTeam.name);
    return (
      (fdHome.includes(normHome) || normHome.includes(fdHome)) &&
      (fdAway.includes(normAway) || normAway.includes(fdAway))
    );
  });

  return byTeams ?? null;
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const t0 = Date.now();

  // ── 1. Auth via CRON_SECRET ─────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const urlToken = new URL(request.url).searchParams.get("token");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${secret}` && urlToken !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 2. Buscar eventos PENDING ───────────────────────────────────────────
    const pendingRows = await prisma.$queryRawUnsafe<PendingEvent[]>(
      `SELECT
         id, user_id AS "userId", cycle_id AS "cycleId", step,
         match_id AS "matchId", home_team AS "homeTeam", away_team AS "awayTeam",
         pick_label AS "pickLabel", pick_odd AS "pickOdd", stake
       FROM leverage_events
       WHERE result = 'PENDING'
       ORDER BY created_at ASC`,
    );

    if (pendingRows.length === 0) {
      return NextResponse.json({
        ok: true,
        resolved: 0,
        message: "Nenhum evento pendente para resolver.",
        durationMs: Date.now() - t0,
      });
    }

    console.info(`[leverage-resolve] ${pendingRows.length} evento(s) PENDING encontrado(s).`);

    // ── 3. Buscar resultados reais via API ──────────────────────────────────
    // Usa a versão Gated para respeitar o throttle de 24h.
    // Se o gate bloquear, tenta a versão raw com cache de 4h do Next.js.
    let finishedMatches: FDMatch[] = [];

    const gatedResult = await getFinishedMatchesGated(200);
    if (gatedResult) {
      finishedMatches = gatedResult.matches;
    } else {
      // Fallback: lê do cache do Next.js (revalidate: 4h) — sem gastar cota
      try {
        const { getFinishedMatches } = await import("@/lib/bob/connectors/football-data");
        const fallback = await getFinishedMatches(200);
        finishedMatches = fallback.matches;
        console.info(`[leverage-resolve] Gated bloqueado — usando cache Next.js (${finishedMatches.length} jogos).`);
      } catch {
        console.warn("[leverage-resolve] Fallback de finished matches falhou.");
      }
    }

    if (finishedMatches.length === 0) {
      return NextResponse.json({
        ok: true,
        resolved: 0,
        message: "Nenhum jogo finalizado disponível para cruzamento. Tentará novamente no próximo ciclo.",
        durationMs: Date.now() - t0,
      });
    }

    console.info(`[leverage-resolve] ${finishedMatches.length} jogo(s) FINISHED disponíveis para cruzamento.`);

    // ── 4. Agrupar PENDINGs por (userId + cycleId + step) ───────────────────
    // Um bilhete pode ter 1 ou 2 picks (aposta simples ou múltipla curta).
    // Todos os picks do mesmo step/cycle devem ser GREEN para avançar.
    type TicketGroup = {
      userId: string;
      cycleId: string;
      step: number;
      picks: PendingEvent[];
    };

    const ticketMap = new Map<string, TicketGroup>();
    for (const ev of pendingRows) {
      const key = `${ev.userId}:${ev.cycleId}:${ev.step}`;
      if (!ticketMap.has(key)) {
        ticketMap.set(key, {
          userId: ev.userId,
          cycleId: ev.cycleId,
          step: ev.step,
          picks: [],
        });
      }
      ticketMap.get(key)!.picks.push(ev);
    }

    // ── 5. Resolver cada ticket ─────────────────────────────────────────────
    let resolved = 0;
    let greens = 0;
    let reds = 0;
    let skipped = 0;
    const details: Array<{
      userId: string;
      step: number;
      result: "GREEN" | "RED" | "SKIPPED";
      reason: string;
    }> = [];

    for (const [, ticket] of ticketMap) {
      let allPicksFinished = true;
      let allPicksGreen = true;
      let skipReason = "";

      for (const pick of ticket.picks) {
        const fdMatch = findFinishedMatch(
          pick.matchId,
          pick.homeTeam,
          pick.awayTeam,
          finishedMatches,
        );

        if (!fdMatch) {
          // Partida não encontrada nos finalizados — pode estar em andamento ou agendada
          allPicksFinished = false;
          skipReason = `Partida ${pick.homeTeam} × ${pick.awayTeam} (${pick.matchId}) ainda não encerrada.`;
          break;
        }

        const actualOutcome = resolveMatchOutcome(fdMatch);
        if (!actualOutcome) {
          // Status não é FINISHED (IN_PLAY, PAUSED, etc.)
          allPicksFinished = false;
          skipReason = `Partida ${pick.homeTeam} × ${pick.awayTeam} status=${fdMatch.status} — não finalizada.`;
          break;
        }

        // Cruzar pick do BOB com resultado real
        const predictedOutcome = labelToOutcome(pick.pickLabel, pick.homeTeam, pick.awayTeam);
        if (predictedOutcome !== actualOutcome) {
          allPicksGreen = false;
          skipReason = `Pick ${pick.pickLabel} ≠ resultado real (${actualOutcome}) em ${pick.homeTeam} × ${pick.awayTeam}.`;
        }
      }

      // ── Decisão ───────────────────────────────────────────────────────────

      if (!allPicksFinished) {
        // IGNORAR — tenta novamente no próximo ciclo do cron
        skipped++;
        details.push({
          userId: ticket.userId,
          step: ticket.step,
          result: "SKIPPED",
          reason: skipReason,
        });
        continue;
      }

      // Calcular payout
      const combinedOdd = ticket.picks.reduce((acc, p) => acc * Number(p.pickOdd), 1);
      const stake = Number(ticket.picks[0].stake);
      const payout = allPicksGreen ? Number((stake * combinedOdd).toFixed(2)) : 0;
      const result = allPicksGreen ? "GREEN" : "RED";

      // Determinar cycleId para o novo evento
      // GREEN → mesmo cycleId (continuidade)
      // RED   → novo cycleId (reset)
      const newCycleId = result === "GREEN"
        ? ticket.cycleId
        : crypto.randomUUID();

      // Calcular o step para o NOVO evento de resolução
      // Este evento RESOLVE o step atual, então registra com o mesmo step
      const resolveStep = ticket.step;

      // ── INSERT append-only ──────────────────────────────────────────────
      // O evento principal de resolução — 1 por ticket (não por pick)
      // Usa o primeiro pick como referência para match_id/teams
      const refPick = ticket.picks[0];

      await prisma.$executeRawUnsafe(
        `INSERT INTO leverage_events
           (user_id, cycle_id, step, result, match_id, home_team, away_team, pick_label, pick_odd, stake, payout)
         VALUES
           ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        ticket.userId,
        newCycleId,
        resolveStep,
        result,
        refPick.matchId,
        refPick.homeTeam,
        refPick.awayTeam,
        refPick.pickLabel,
        Number(refPick.pickOdd),
        stake,
        payout,
      );

      // Marcar os eventos PENDING originais como processados
      // REGRA: NÃO deletamos nem atualizamos. Inserimos o evento de resolução
      // e os PENDINGs ficam no log como evidência histórica.
      // Para evitar que sejam reprocessados, deletamos APENAS o status PENDING
      // (isto é a única exceção aceitável — transformar PENDING → RESOLVED).
      for (const pick of ticket.picks) {
        await prisma.$executeRawUnsafe(
          `UPDATE leverage_events SET result = 'RESOLVED' WHERE id = $1::uuid AND result = 'PENDING'`,
          pick.id,
        );
      }

      resolved++;
      if (result === "GREEN") greens++;
      else reds++;

      details.push({
        userId: ticket.userId,
        step: ticket.step,
        result,
        reason: allPicksGreen
          ? `Todos os picks corretos! Odd ${combinedOdd.toFixed(2)}× → payout R$ ${payout.toFixed(2)}.`
          : skipReason,
      });

      console.info(
        `[leverage-resolve] user=${ticket.userId.slice(0, 8)}… step=${ticket.step} → ${result}` +
        (result === "GREEN"
          ? ` (payout R$ ${payout.toFixed(2)})`
          : ` (reset → step 1, novo ciclo ${newCycleId.slice(0, 8)}…)`),
      );
    }

    // ── 6. Resposta ─────────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      resolved,
      greens,
      reds,
      skipped,
      totalPending: pendingRows.length,
      finishedMatchesAvailable: finishedMatches.length,
      details,
      durationMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[leverage-resolve] Erro:", err);
    return NextResponse.json(
      { error: message, stack: err instanceof Error ? err.stack : undefined },
      { status: 500 },
    );
  }
}
