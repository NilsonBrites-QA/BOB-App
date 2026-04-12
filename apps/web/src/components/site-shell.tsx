import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { NavLink } from "@/components/nav-link";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

type SiteShellProps = {
  children: React.ReactNode;
};

export async function SiteShell({ children }: SiteShellProps) {
  // Páginas de auth não usam o shell (header/footer ficam fora)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/auth/");
  if (isAuthPage) return <>{children}</>;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = Boolean(user);

  const isAdmin = isLoggedIn && user?.email
    ? await prisma.user.findUnique({
        where:  { email: user.email.toLowerCase() },
        select: { role: true },
      }).then((u) => u?.role === "ADMIN").catch(() => false)
    : false;

  return (
    <div className="layout-container flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[rgba(252,250,244,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/bob-logo.png"
              alt="BOB"
              width={52}
              height={52}
              priority
            />
            <span className="font-mono text-sm font-semibold tracking-tight">BOB</span>
          </Link>

          {isLoggedIn ? (
            <nav className="flex flex-wrap items-center justify-end gap-1">
              {/* Análise */}
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/estatisticas">Estatísticas</NavLink>
              <NavLink href="/historico">Histórico</NavLink>

              <span className="mx-1 h-3 w-px shrink-0 bg-border" aria-hidden />

              {/* Liga */}
              <NavLink href="/classificacao">Classificação</NavLink>
              <NavLink href="/calendario">Calendário</NavLink>

              <span className="mx-1 h-3 w-px shrink-0 bg-border" aria-hidden />

              {/* Ferramentas */}
              <NavLink href="/chat">Chat</NavLink>
              <NavLink href="/investimento-retorno">I×R</NavLink>

              {/* Admin — apenas para ADMIN */}
              {isAdmin && (
                <>
                  <span className="mx-1 h-3 w-px shrink-0 bg-border" aria-hidden />
                  <NavLink href="/admin">Admin</NavLink>
                </>
              )}

              <form action={signOut} className="ml-1">
                <button
                  type="submit"
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
                >
                  Sair
                </button>
              </form>
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col">{children}</main>

      <footer className="mt-8 border-t border-border px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>BOB v0.1.0 · inteligência operacional por rodada · controle de acesso e performance</p>
          <p className="font-mono">apps/web</p>
        </div>
      </footer>
    </div>
  );
}