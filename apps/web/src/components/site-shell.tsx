import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { NavLink } from "@/components/nav-link";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/server";

type SiteShellProps = {
  children: React.ReactNode;
};

export async function SiteShell({ children }: SiteShellProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = Boolean(user);

  return (
    <div className="layout-container flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[rgba(252,250,244,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/icons/icon-192.png"
              alt="Logo do Big Odds Bot"
              width={44}
              height={44}
              className="rounded-2xl border border-border shadow-[0_8px_20px_rgba(18,32,24,0.16)]"
              priority
            />
            <div>
              <p className="text-base font-semibold tracking-tight">Big Odds Bot</p>
              <p className="text-xs text-muted">Cérebro, memória e estratégia da rodada</p>
            </div>
          </Link>

          {isLoggedIn ? (
            <nav className="flex flex-wrap items-center justify-end gap-2">
              <NavLink href="/">Início</NavLink>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/admin">Admin</NavLink>
              <NavLink href="/investimento-retorno">Investimento x Retorno</NavLink>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
                >
                  Sair
                </button>
              </form>
            </nav>
          ) : (
            <nav className="flex items-center">
              <Link
                href="/login"
                className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
              >
                Entrar
              </Link>
            </nav>
          )}
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