/**
 * BOB — Route Handler: PATCH /api/bob/betslip/[id]/picks
 *
 * Registra o resultado real de todos os picks de uma rodada.
 * Usado pelo formulário de pós-rodada no painel admin.
 *
 * Params:
 *   id — roundDbId (UUID)
 *
 * Body (JSON):
 *   picks: Array<{ pickId: string; actualResult: "HOME"|"DRAW"|"AWAY"; correct: boolean }>
 *   result?: { variationPlayed?, stakePerVariation, totalStaked, grossReturn, netReturn, hit, notes? }
 */

import { NextResponse } from "next/server";
import { markPickResult, saveRoundResult } from "@/lib/bob/persist";
import { prisma } from "@/lib/db";

type PickUpdate = {
  pickId:       string;
  actualResult: "HOME" | "DRAW" | "AWAY";
  correct:      boolean;
};

type RoundResultUpdate = {
  variationPlayed?:  string;
  stakePerVariation: number;
  totalStaked:       number;
  grossReturn:       number;
  netReturn:         number;
  hit:               boolean;
  notes?:            string;
};

type RequestBody = {
  picks:   PickUpdate[];
  result?: RoundResultUpdate;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundDbId } = await params;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { picks, result } = body;

  if (!picks || picks.length === 0) {
    return NextResponse.json(
      { error: "Campo 'picks' obrigatório e não pode ser vazio." },
      { status: 400 }
    );
  }

  try {
    // Marcar resultado de cada pick em paralelo
    await Promise.all(picks.map((p) => markPickResult(p)));

    // Fechar a rodada com status CLOSED
    await prisma.round.update({
      where: { id: roundDbId },
      data:  { status: "CLOSED" },
    });

    // Salvar resultado financeiro da rodada se fornecido
    if (result) {
      await saveRoundResult({ roundDbId, ...result });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error(`[/api/bob/betslip/${roundDbId}/picks PATCH]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
