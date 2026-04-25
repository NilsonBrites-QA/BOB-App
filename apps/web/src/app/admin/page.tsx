import { cookies } from "next/headers";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { adminControls, featureFlags, integrations, memoryLayers } from "@/lib/bob/mock-data";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { changeUserRole, grantUserAccess, toggleUserAccess } from "./access-actions";
import { getSimulationProgress } from "@/lib/bob/engine/blind-simulation";

export default async function AdminPage() {
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

  // Só admins podem abrir o painel administrativo.
  if (!currentUser?.active || currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <section className="panel rounded-[28px] p-8">
          <p className="kicker text-sm text-muted">Acesso restrito</p>
          <h1 className="mt-2 text-3xl font-semibold">Painel disponível apenas para administradores.</h1>
          <p className="mt-3 max-w-3xl text-base leading-8 text-muted">
            Solicite liberação ao admin principal do sistema para receber perfil ADMIN.
          </p>
        </section>
      </div>
    );
  }

  const users = await prisma.user.findMany({
    // Pendentes (active=false) primeiro, depois ADMINs, depois por data
    orderBy: [{ active: "asc" }, { role: "asc" }, { createdAt: "desc" }],
  });
  const pendingUsers = users.filter((u) => !u.active);

  const simProgress = await getSimulationProgress().catch(() => null);

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      <section className="panel rounded-[28px] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <p className="kicker text-sm text-muted">Painel administrativo</p>
            <h1 className="text-4xl font-semibold leading-tight">Controle de integrações, custos, cache profundo e governança do cérebro.</h1>
            <p className="max-w-3xl text-base leading-8 text-muted">
              O admin é obrigatório para operar o BOB sem tocar em código:
              quotas, feature flags, janelas de coleta, versão de prompt,
              integridade da memória e custos por análise.
            </p>
            <div className="rounded-3xl border border-border bg-surface-strong px-5 py-4 text-sm leading-7 text-muted">
              <p className="kicker text-xs text-muted">Status Supabase</p>
              <p className="mt-2">
                {user
                  ? `Sessão ativa para ${user.email ?? "usuário autenticado"}.`
                  : "Supabase conectado via SSR, sem usuário autenticado no momento."}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {adminControls.map((control) => (
              <SectionCard
                key={control.title}
                title={control.title}
                value={control.value}
                description={control.note}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Integrações</p>
          <div className="mt-5 space-y-4">
            {integrations.map((integration) => (
              <div key={integration.name} className="rounded-[20px] border border-border bg-surface-strong p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{integration.name}</h2>
                    <p className="mt-1 text-sm leading-7 text-muted">{integration.role}</p>
                  </div>
                  <span className={[
                    "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]",
                    integration.status === "connected"
                      ? "bg-accent text-white"
                      : "bg-[rgba(183,139,47,0.18)] text-[#7a5700]",
                  ].join(" ")}>
                    {integration.status === "connected" ? "ativo" : "planejado"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
                  <div>
                    <p className="font-medium text-foreground">Quota</p>
                    <p>{integration.quota}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Cache</p>
                    <p>{integration.cachePolicy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel rounded-3xl p-6">
          <p className="kicker text-xs text-muted">Feature flags</p>
          <div className="mt-5 space-y-4">
            {featureFlags.map((flag) => (
              <div key={flag.name} className="rounded-[20px] border border-border bg-surface-strong p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{flag.name}</h2>
                    <p className="mt-1 text-sm leading-7 text-muted">{flag.note}</p>
                  </div>
                  <span className={[
                    "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]",
                    flag.enabled
                      ? "bg-accent text-white"
                      : "bg-[rgba(96,112,98,0.18)] text-muted",
                  ].join(" ")}>
                    {flag.enabled ? "on" : "off"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel rounded-3xl p-6">
        <p className="kicker text-xs text-muted">Camadas de memória</p>
        <div className="mt-5 overflow-hidden rounded-[20px] border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Camada</th>
                <th className="px-4 py-3 font-medium">Retenção</th>
                <th className="px-4 py-3 font-medium">Propósito</th>
                <th className="px-4 py-3 font-medium">Uso no motor</th>
              </tr>
            </thead>
            <tbody>
              {memoryLayers.map((layer) => (
                <tr key={layer.name} className="border-t border-border/70 align-top">
                  <td className="px-4 py-3 font-medium">{layer.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{layer.retention}</td>
                  <td className="px-4 py-3 text-muted">{layer.purpose}</td>
                  <td className="px-4 py-3 text-muted">{layer.motorUsage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Simulação Retroativa ─────────────────────────────────── */}
      <section className="panel rounded-3xl p-6">
        <p className="kicker text-xs text-muted">Simulação retroativa cega</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-semibold">Progresso da simulação</h2>
            <p className="mt-1 text-sm leading-7 text-muted">
              BOB simula rodadas passadas como se fossem atuais e mede a acurácia por variação.
              Cada execução do cron <code className="rounded bg-surface-strong px-1 text-xs">/api/cron/simulate</code> processa uma rodada.
            </p>
          </div>
          {simProgress && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-3xl font-semibold tabular-nums">
                {simProgress.simulated}
                <span className="text-base font-normal text-muted">/{simProgress.totalRounds}</span>
              </span>
              <span className="text-xs text-muted">rodadas simuladas</span>
            </div>
          )}
        </div>

        {simProgress && (
          <div className="mt-5 space-y-3">
            {/* Barra de progresso */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: simProgress.totalRounds > 0
                    ? `${Math.round((simProgress.simulated / simProgress.totalRounds) * 100)}%`
                    : "0%",
                }}
              />
            </div>

            {/* Métricas resumidas */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Simuladas</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{simProgress.simulated}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Pendentes</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{simProgress.pending}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-surface-strong px-4 py-3">
                <p className="text-xs text-muted">Última rodada simulada</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {simProgress.lastRound !== null ? `R${simProgress.lastRound}` : "—"}
                </p>
              </div>
            </div>

            {simProgress.pending === 0 && simProgress.totalRounds > 0 && (
              <p className="text-xs text-accent font-medium">
                ✓ Todas as rodadas disponíveis já foram simuladas.
              </p>
            )}
          </div>
        )}

        {!simProgress && (
          <p className="mt-4 text-sm text-muted">Sem dados de simulação ainda. Execute <code className="rounded bg-surface-strong px-1 text-xs">/api/cron/simulate</code> após o backfill.</p>
        )}
      </section>

      {/* ── Relatórios ────────────────────────────────────────────── */}
      <section className="panel rounded-3xl p-6">
        <p className="kicker text-xs text-muted">Relatórios analíticos</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/calibration"
            className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface-strong px-5 py-4 transition hover:border-accent"
          >
            <span className="text-sm font-semibold">Calibração de pesos</span>
            <span className="text-xs text-muted leading-6">Evolução histórica dos pesos do motor e padrões condicionais.</span>
          </Link>
          <Link
            href="/admin/season-report"
            className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface-strong px-5 py-4 transition hover:border-accent"
          >
            <span className="text-sm font-semibold">Relatório de temporada</span>
            <span className="text-xs text-muted leading-6">Comparativo V1–V5 por acurácia de picks e ROI acumulado.</span>
          </Link>
          <Link
            href="/admin/cerebro"
            className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface-strong px-5 py-4 transition hover:border-accent"
          >
            <span className="text-sm font-semibold">Cérebro observável</span>
            <span className="text-xs text-muted leading-6">Telemetria viva do BOB com conexões reais, memória e modo cognitivo.</span>
          </Link>
          <Link
            href="/admin/llm"
            className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface-strong px-5 py-4 transition hover:border-accent"
          >
            <span className="text-sm font-semibold">🧠 Análise LLM das variações</span>
            <span className="text-xs text-muted leading-6">Status, kill switch e botão para recalcular sob demanda. Controla custo de tokens.</span>
          </Link>
        </div>
      </section>

      {/* ── Solicitações pendentes (destaque quando há pendentes) ── */}
      {pendingUsers.length > 0 && (
        <section className="panel rounded-3xl border-2 border-amber-500/60 bg-amber-500/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="kicker text-xs font-semibold text-amber-600">⚠ Aguardando aprovação</p>
              <h2 className="mt-2 text-2xl font-semibold">
                {pendingUsers.length} solicitaç{pendingUsers.length === 1 ? "ão" : "ões"} de acesso pendente{pendingUsers.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Estes emails tentaram fazer login mas ainda não foram autorizados. Aprove para liberar acesso.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-white/60 px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-medium">{u.email}</span>
                  <span className="text-xs text-muted">
                    Solicitado em {new Date(u.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <form action={toggleUserAccess} className="flex gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="active" value="true" />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    ✓ Aprovar acesso
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Whitelist ─────────────────────────────────────────────── */}
      <section className="panel rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker text-xs text-muted">Controle de acesso</p>
            <h2 className="mt-2 text-2xl font-semibold">Whitelist de usuários</h2>
          </div>
        </div>

        <form action={grantUserAccess} className="mt-5 grid gap-3 rounded-[20px] border border-border bg-surface-strong p-4 sm:grid-cols-[1fr_auto_auto]">
          <input
            name="email"
            type="email"
            required
            placeholder="novo.usuario@email.com"
            className="rounded-xl border border-border bg-transparent px-4 py-2 text-sm"
          />
          <select name="role" defaultValue="VIEWER" className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm">
            <option value="VIEWER">VIEWER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
            Liberar acesso
          </button>
        </form>

        <div className="mt-5 overflow-hidden rounded-[20px] border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[rgba(29,92,65,0.06)] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isPrimary = u.email.toLowerCase() === "nilson.brites@gmail.com";
                return (
                  <tr key={u.id} className="border-t border-border/70 align-top">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <form action={changeUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          disabled={isPrimary}
                          className="rounded-lg border border-border bg-transparent px-2 py-1 text-xs"
                        >
                          <option value="VIEWER">VIEWER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                        <button
                          type="submit"
                          disabled={isPrimary}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted disabled:opacity-50"
                        >
                          Salvar
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs font-semibold",
                          u.active ? "bg-accent/15 text-accent-strong" : "bg-red-100 text-red-700",
                        ].join(" ")}
                      >
                        {u.active ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleUserAccess}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <button
                          type="submit"
                          disabled={isPrimary}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-muted disabled:opacity-50"
                        >
                          {u.active ? "Bloquear" : "Liberar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}