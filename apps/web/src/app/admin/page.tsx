import { cookies } from "next/headers";
import { SectionCard } from "@/components/section-card";
import { adminControls, featureFlags, integrations, memoryLayers } from "@/lib/bob/mock-data";
import { createClient } from "@/utils/supabase/server";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    </div>
  );
}