/**
 * BOB — Gerador de "Criar Apostas" por partida
 *
 * Conforme PRD `criar-apostas.md`:
 *   - O BOB ENTREGA apostas prontas (não permite o usuário criar)
 *   - 3 tickets por partida: ALAVANCAGEM + MODERADA + AGRESSIVA
 *   - Cada ticket combina 2-4 mercados COERENTES da mesma narrativa
 *   - Usuário copia o ticket que alinha ao seu perfil
 *
 * Regras de negócio:
 *   ALAVANCAGEM: odd combinada 1.20–2.50, picks seguros (resultado + mercado defensivo)
 *   MODERADA:    odd combinada 2.50–6.00, picks equilibrados (resultado + BTTS/OU)
 *   AGRESSIVA:   odd combinada 6.00–30.0, picks de valor alto (zebra + mercados exóticos)
 */

import type { ScoredMatch } from "./scoring";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CriarApostaPick = {
  market: string;
  label: string;
  odd: number;
  probability: number;
};

export type CriarApostaProfile = "ALAVANCAGEM" | "MODERADA" | "AGRESSIVA";

export type BetResult = "GREEN" | "RED" | "PENDING";

export type CriarAposta = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  competition: string;
  profile: CriarApostaProfile;
  picks: CriarApostaPick[];
  combinedOdd: number;
  combinedProbability: number;
  confidence: number;
  bobNarrative: string;
  riskLabel: "Baixo" | "Médio" | "Alto";
  alerts: string[];
  result: BetResult;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function oddToProb(odd: number): number {
  if (!odd || odd <= 1) return 0;
  return 1 / odd;
}

function probToOdd(prob: number): number {
  if (prob <= 0) return 99;
  if (prob >= 0.99) return 1.01;
  return Math.round((1 / prob) * 100) / 100;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function estimateOver25Prob(homeOdd: number, drawOdd: number, awayOdd: number): number {
  const totalImplied = oddToProb(homeOdd) + oddToProb(drawOdd) + oddToProb(awayOdd);
  const homeProb = oddToProb(homeOdd) / totalImplied;
  const drawProb = oddToProb(drawOdd) / totalImplied;
  const awayProb = oddToProb(awayOdd) / totalImplied;
  const disparity = Math.abs(homeProb - awayProb);
  const openness = 1 - drawProb;
  return clamp(0.40 + disparity * 0.4 + (openness - 0.7) * 0.3, 0.32, 0.78);
}

function estimateBttsProb(homeOdd: number, drawOdd: number, awayOdd: number): number {
  const totalImplied = oddToProb(homeOdd) + oddToProb(drawOdd) + oddToProb(awayOdd);
  const homeProb = oddToProb(homeOdd) / totalImplied;
  const awayProb = oddToProb(awayOdd) / totalImplied;
  const disparity = Math.abs(homeProb - awayProb);
  return clamp(0.55 - disparity * 0.5, 0.28, 0.72);
}

// ─── Gerador por perfil ────────────────────────────────────────────────────────

function buildPicks(
  match: ScoredMatch,
  profile: CriarApostaProfile,
): { picks: CriarApostaPick[]; narrative: string; alerts: string[] } {
  const totalImplied = oddToProb(match.homeOdd) + oddToProb(match.drawOdd) + oddToProb(match.awayOdd);
  const homeProb = oddToProb(match.homeOdd) / totalImplied;
  const drawProb = oddToProb(match.drawOdd) / totalImplied;
  const awayProb = oddToProb(match.awayOdd) / totalImplied;
  const bobScore = match.score;

  const over25Prob  = estimateOver25Prob(match.homeOdd, match.drawOdd, match.awayOdd);
  const bttsProb    = estimateBttsProb(match.homeOdd, match.drawOdd, match.awayOdd);
  const under25Prob = 1 - over25Prob;
  const bttsNoProb  = 1 - bttsProb;

  // Determinar narrativa dominante
  const isClearHomeFav  = homeProb > 0.55 && match.homeOdd <= 1.80;
  const isClearAwayFav  = awayProb > 0.50 && match.awayOdd <= 1.90;
  const isBalanced      = Math.abs(homeProb - awayProb) < 0.15 || drawProb > 0.30;
  const isHighScoring   = over25Prob > 0.60;

  const picks: CriarApostaPick[] = [];
  const alerts: string[]         = [];
  let narrative = "";

  // ── ALAVANCAGEM — segurança máxima, 2–3 picks de baixo risco ─────────────
  if (profile === "ALAVANCAGEM") {
    if (isClearHomeFav) {
      // Pick 1: resultado
      picks.push({ market: "1X2", label: `Vitória ${match.homeTeam}`, odd: match.homeOdd, probability: homeProb });
      // Pick 2: mercado defensivo seguro
      if (under25Prob >= 0.52) {
        picks.push({ market: "OU", label: "Menos de 3.5 gols", odd: clamp(probToOdd(clamp(under25Prob + 0.15, 0.5, 0.92)), 1.15, 1.60), probability: clamp(under25Prob + 0.15, 0.5, 0.92) });
      } else {
        picks.push({ market: "OU", label: "Mais de 1.5 gols", odd: clamp(probToOdd(0.80), 1.15, 1.50), probability: 0.80 });
      }
      narrative = `${match.homeTeam} é favorito sólido (score ${bobScore}/100, odd ${match.homeOdd.toFixed(2)}). Combinação resultado + linha de gols conservadora — cobre o cenário mais provável com margem de segurança.`;
    } else if (isClearAwayFav) {
      picks.push({ market: "1X2", label: `Vitória ${match.awayTeam}`, odd: match.awayOdd, probability: awayProb });
      picks.push({ market: "OU",  label: "Menos de 3.5 gols", odd: clamp(probToOdd(0.68), 1.25, 1.55), probability: 0.68 });
      narrative = `${match.awayTeam} entra como favorito mesmo fora de casa (odd ${match.awayOdd.toFixed(2)}). Combinação resultado + jogo controlado.`;
    } else {
      // Equilibrado: dupla chance + under
      const dcProb = homeProb >= awayProb ? homeProb + drawProb : awayProb + drawProb;
      const dcLabel = homeProb >= awayProb
        ? `${match.homeTeam} ou Empate (1X)` : `${match.awayTeam} ou Empate (X2)`;
      picks.push({ market: "DC", label: dcLabel, odd: clamp(probToOdd(dcProb), 1.10, 1.60), probability: dcProb });
      picks.push({ market: "OU", label: "Menos de 3.5 gols", odd: clamp(probToOdd(0.72), 1.20, 1.50), probability: 0.72 });
      narrative = `Jogo equilibrado. Dupla chance cobre ${(dcProb * 100).toFixed(0)}% das probabilidades combinada com linha de gols defensiva — proteção máxima.`;
      if (match.isClassico) alerts.push("Clássico regional — volatilidade elevada");
    }
  }

  // ── MODERADA — equilíbrio, 2–3 picks de médio risco ───────────────────────
  else if (profile === "MODERADA") {
    if (isClearHomeFav) {
      picks.push({ market: "1X2",  label: `Vitória ${match.homeTeam}`, odd: match.homeOdd, probability: homeProb });
      // Segundo mercado: BTTS ou Over/Under mais arriscado
      if (bttsProb > 0.52) {
        picks.push({ market: "BTTS", label: "Ambas marcam: Sim", odd: clamp(probToOdd(bttsProb), 1.50, 2.20), probability: bttsProb });
        narrative = `${match.homeTeam} favorito com jogo aberto. Resultado + ambas marcam: narrativa de vitória construída com gols dos dois lados.`;
      } else {
        picks.push({ market: "OU", label: "Mais de 2.5 gols", odd: clamp(probToOdd(over25Prob), 1.50, 2.40), probability: over25Prob });
        narrative = `${match.homeTeam} favorito com tendência ofensiva (over 2.5: ${(over25Prob * 100).toFixed(0)}%). Combinação resultado + volume de gols.`;
      }
      // Terceiro pick opcional se a odd combinada for < 3.5
      if (picks.length === 2) {
        const combo2 = picks.reduce((a, p) => a * p.odd, 1);
        if (combo2 < 3.50 && !isBalanced) {
          const over35Odd = clamp(probToOdd(clamp(over25Prob - 0.15, 0.25, 0.65)), 1.70, 3.00);
          picks.push({ market: "OU", label: "Mais de 2.5 gols no 2º tempo", odd: over35Odd, probability: clamp(over25Prob - 0.15, 0.25, 0.65) });
        }
      }
    } else if (isClearAwayFav) {
      picks.push({ market: "1X2",  label: `Vitória ${match.awayTeam}`, odd: match.awayOdd, probability: awayProb });
      picks.push({ market: "BTTS", label: bttsProb > 0.52 ? "Ambas marcam: Sim" : "Ambas marcam: Não",
        odd: clamp(probToOdd(bttsProb > 0.52 ? bttsProb : bttsNoProb), 1.55, 2.30),
        probability: bttsProb > 0.52 ? bttsProb : bttsNoProb });
      narrative = `${match.awayTeam} favorito fora de casa. Resultado + mercado de gols complementar.`;
    } else {
      // Equilibrado: resultado mais provável + OU
      const mainOdd   = homeProb >= awayProb ? match.homeOdd : match.awayOdd;
      const mainLabel = homeProb >= awayProb ? `Vitória ${match.homeTeam}` : `Vitória ${match.awayTeam}`;
      const mainProb  = homeProb >= awayProb ? homeProb : awayProb;
      picks.push({ market: "1X2", label: mainLabel, odd: mainOdd, probability: mainProb });
      picks.push({ market: "OU",  label: isHighScoring ? "Mais de 2.5 gols" : "Menos de 2.5 gols",
        odd: clamp(probToOdd(isHighScoring ? over25Prob : under25Prob), 1.55, 2.50),
        probability: isHighScoring ? over25Prob : under25Prob });
      narrative = `Jogo equilibrado. Apostamos no resultado mais provável combinado com mercado de gols — leitura dos dados aponta para ${isHighScoring ? "jogo aberto" : "partida fechada"}.`;
      if (match.isClassico) alerts.push("Clássico: resultado imprevisível — aposta de médio valor");
    }
  }

  // ── AGRESSIVA — alto retorno, 3–4 picks de risco elevado ──────────────────
  else {
    // Pick 1: resultado de menor probabilidade (zebra controlada ou visitante improvável)
    if (isBalanced && match.drawOdd <= 3.80) {
      picks.push({ market: "1X2", label: "Empate", odd: match.drawOdd, probability: drawProb });
    } else if (!isClearHomeFav && match.awayOdd >= 2.50 && match.awayOdd <= 5.50) {
      picks.push({ market: "1X2", label: `Vitória ${match.awayTeam}`, odd: match.awayOdd, probability: awayProb });
    } else {
      // Casa mas pick agressivo: jogo com muitos gols
      picks.push({ market: "OU", label: "Mais de 3.5 gols", odd: clamp(probToOdd(clamp(over25Prob - 0.20, 0.18, 0.55)), 2.00, 5.00), probability: clamp(over25Prob - 0.20, 0.18, 0.55) });
    }

    // Pick 2: BTTS + resultado
    picks.push({
      market: "BTTS",
      label: bttsProb >= 0.50 ? "Ambas marcam: Sim" : "Ambas marcam: Não",
      odd: clamp(probToOdd(bttsProb >= 0.50 ? bttsProb : bttsNoProb), 1.60, 2.50),
      probability: bttsProb >= 0.50 ? bttsProb : bttsNoProb,
    });

    // Pick 3: over agressivo
    picks.push({
      market: "OU",
      label: isHighScoring ? "Mais de 3.5 gols" : "Mais de 2.5 gols",
      odd: clamp(probToOdd(clamp(over25Prob - 0.10, 0.22, 0.60)), 1.80, 4.50),
      probability: clamp(over25Prob - 0.10, 0.22, 0.60),
    });

    // Pick 4 opcional: marcador específico simulado (cantos/escanteios)
    const combo3 = picks.reduce((a, p) => a * p.odd, 1);
    if (combo3 < 8.00) {
      picks.push({
        market: "OU",
        label: "Mais de 9.5 escanteios",
        odd: clamp(probToOdd(0.52), 1.80, 2.20),
        probability: 0.52,
      });
    }

    const comboOdd = picks.reduce((a, p) => a * p.odd, 1);
    narrative = `Ticket agressivo com ${picks.length} mercados — odd combinada ${comboOdd.toFixed(2)}x. Cenário de alto retorno: ${match.homeTeam} x ${match.awayTeam} com exploração de mercados secundários. Alto risco, jogue com posição reduzida.`;
    alerts.push("Ticket agressivo: use no máximo 5% do bankroll");
    if (match.isClassico) alerts.push("Clássico — volatilidade muito elevada neste perfil");
  }

  return { picks, narrative, alerts };
}

// ─── Gerador principal (1 jogo → 3 tickets) ───────────────────────────────────

export function buildCriarAposta(match: ScoredMatch): CriarAposta[] {
  const profiles: CriarApostaProfile[] = ["ALAVANCAGEM", "MODERADA", "AGRESSIVA"];

  return profiles.map((profile) => {
    const { picks, narrative, alerts } = buildPicks(match, profile);

    // Garantia: mínimo 2 picks
    if (picks.length < 2) {
      picks.push({
        market: "OU",
        label: "Menos de 3.5 gols",
        odd: 1.30,
        probability: 0.76,
      });
    }

    const combinedOdd         = Math.round(picks.reduce((a, p) => a * p.odd, 1) * 100) / 100;
    const combinedProbability = Math.round(picks.reduce((a, p) => a * p.probability, 1) * 1000) / 1000;
    const confidence          = clamp(Math.round(combinedProbability * 100 + match.score * 0.10), 10, 95);

    let riskLabel: "Baixo" | "Médio" | "Alto" = "Médio";
    if (combinedOdd <= 2.00 && confidence >= 60) riskLabel = "Baixo";
    else if (combinedOdd > 5.00 || confidence < 40) riskLabel = "Alto";

    return {
      matchId:             match.id,
      homeTeam:            match.homeTeam,
      awayTeam:            match.awayTeam,
      scheduledAt:         "",
      competition:         "Brasileirão",
      profile,
      picks,
      combinedOdd,
      combinedProbability,
      confidence,
      bobNarrative:        narrative,
      riskLabel,
      alerts,
      result:              "PENDING" as BetResult,  // atualizado pós-jogo via admin
    };
  });
}

/**
 * Gera 3 tickets por partida (ALAVANCAGEM + MODERADA + AGRESSIVA).
 * Filtra partidas com odds inválidas.
 * Retorna lista plana, ordenada por perfil.
 */
export function buildCriarApostasForRound(matches: ScoredMatch[]): CriarAposta[] {
  const valid = matches.filter((m) => m.homeOdd > 0 && m.drawOdd > 0 && m.awayOdd > 0);

  // Gerar 3 tickets por jogo, ordenar por perfil para o filtro funcionar corretamente
  const all = valid.flatMap((m) => buildCriarAposta(m));

  // Ordenar: ALAVANCAGEM → MODERADA → AGRESSIVA, dentro de cada grupo por odd combinada
  const ORDER: Record<CriarApostaProfile, number> = { ALAVANCAGEM: 0, MODERADA: 1, AGRESSIVA: 2 };
  return all.sort((a, b) => {
    const profileDiff = ORDER[a.profile] - ORDER[b.profile];
    if (profileDiff !== 0) return profileDiff;
    return a.combinedOdd - b.combinedOdd;
  });
}
