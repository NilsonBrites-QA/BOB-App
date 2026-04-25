/**
 * Admin · Análise LLM das Variações
 *
 * Mostra ao admin:
 *  - Status da LLM (habilitada/bloqueada via BOB_DISABLE_LLM)
 *  - Última análise pré-computada por (season, round)
 *  - Provider que gerou (claude/gpt/gemini/heuristic)
 *  - Botão "Recalcular agora" → dispara LLM sob demanda
 *
 * Acesso: ADMIN.
 */

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { LlmAdminClient } from "./llm-admin-client";

export const dynamic = "force-dynamic";

export default async function LlmAdminPage() {
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

  if (!currentUser?.active || currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="panel rounded-[28px] p-8">
          <p className="kicker text-sm text-muted">Acesso restrito</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Painel disponível apenas para administradores.
          </h1>
        </section>
      </div>
    );
  }

  const judgements = await prisma.variationJudgement.findMany({
    orderBy: [{ season: "desc" }, { round: "desc" }],
    take: 20,
  });

  const llmDisabled =
    process.env.BOB_DISABLE_LLM === "1" || process.env.BOB_DISABLE_LLM === "true";
  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGptKey = !!process.env.OPENAI_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  return (
    <LlmAdminClient
      llmDisabled={llmDisabled}
      hasClaudeKey={hasClaudeKey}
      hasGptKey={hasGptKey}
      hasGeminiKey={hasGeminiKey}
      judgements={judgements.map((j) => ({
        id: j.id,
        season: j.season,
        round: j.round,
        provider: j.provider,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
        payloadSummary: summarizePayload(j.payload as unknown),
      }))}
      currentSeason={new Date().getFullYear()}
    />
  );
}

function summarizePayload(payload: unknown): {
  enrichments: number;
  replacementsProposed: number;
  replacementsApproved: number;
} {
  if (!payload || typeof payload !== "object") {
    return { enrichments: 0, replacementsProposed: 0, replacementsApproved: 0 };
  }
  const p = payload as {
    enrichments?: unknown[];
    replacements?: Array<{ approved?: boolean }>;
  };
  const replacements = Array.isArray(p.replacements) ? p.replacements : [];
  return {
    enrichments: Array.isArray(p.enrichments) ? p.enrichments.length : 0,
    replacementsProposed: replacements.length,
    replacementsApproved: replacements.filter((r) => r.approved === true).length,
  };
}
