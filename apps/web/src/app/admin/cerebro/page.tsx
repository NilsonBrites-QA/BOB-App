import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { BrainObservatory } from "@/components/admin/brain-observatory";

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

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
      <section className="panel rounded-3xl px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="kicker text-xs text-muted">Admin · Cérebro observável</p>
            <h1 className="mt-1 text-3xl font-semibold">BOB Live Brain Console</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              Verdades de produção: conexões reais, memória viva, evolução de aprendizado e modo cognitivo ativo.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground"
          >
            Voltar ao painel
          </Link>
        </div>
      </section>

      <BrainObservatory initialSeason={new Date().getFullYear()} />
    </div>
  );
}
