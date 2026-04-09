import { cookies } from "next/headers";
import { SectionCard } from "@/components/section-card";
import { adminControls, featureFlags, integrations, memoryLayers } from "@/lib/bob/mock-data";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { changeUserRole, grantUserAccess, toggleUserAccess } from "./access-actions";

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
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

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