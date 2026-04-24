import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BrainObservatory } from "@/components/admin/brain-observatory";
import { PageHero } from "@/components/page-hero";
import { resolveBrainSeasonSummary } from "@/lib/admin/brain-season";

export default async function AdminCerebroPage() {
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
          <h1 className="mt-2 text-3xl font-semibold">Painel do cérebro disponível apenas para administradores.</h1>
          <p className="mt-3 max-w-3xl text-base leading-8 text-muted">
            Este ambiente mostra telemetria real da inteligência do BOB e é bloqueado para perfis não administrativos.
          </p>
          <Link href="/admin" className="mt-5 inline-flex rounded-xl border border-border px-4 py-2 text-sm text-muted hover:border-accent hover:text-foreground">
            Voltar ao admin
          </Link>
        </section>
      </div>
    );
  }

  const brainSeason = await resolveBrainSeasonSummary();

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Admin · Cérebro observável"
        title="BOB Live Brain Console"
        description="Verdades operacionais do cérebro em produção: conexões reais, memória viva, evolução de aprendizado e o modo cognitivo que está governando o motor agora."
        chips={[
          { label: "Telemetria real", tone: "accent" },
          { label: "Memória viva", tone: "neutral" },
          { label: "Integrações auditáveis", tone: "neutral" },
        ]}
        metrics={[
          { label: "Temporada inicial", value: `${brainSeason.initialSeason}`, note: "temporada resolvida para o console" },
          {
            label: "Última com dados",
            value: brainSeason.latestSeasonWithRounds ? `${brainSeason.latestSeasonWithRounds}` : "Nenhuma",
            note: "última temporada com rodadas materializadas",
          },
        ]}
        aside={(
          <div className="rounded-[24px] border border-border/80 bg-background/55 p-5 backdrop-blur">
            <p className="kicker text-[11px] text-muted">Navegação</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use este painel para distinguir ambiente vazio, sinal congelado e operação realmente saudável sem depender de leitura implícita do layout.
            </p>
            <Link
              href="/admin"
              className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground"
            >
              Voltar ao painel
            </Link>
          </div>
        )}
      />

      <BrainObservatory
        initialSeason={brainSeason.initialSeason}
        latestSeasonWithData={brainSeason.latestSeasonWithRounds}
      />
    </div>
  );
}
