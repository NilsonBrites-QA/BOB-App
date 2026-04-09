import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { signOut } from "@/app/auth/actions";

type SiteShellProps = {
  children: React.ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[rgba(247,244,236,0.84)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-white">
              BOB
            </div>
            <div>
              <p className="text-base font-semibold">Big Odds Bot</p>
              <p className="text-xs text-muted">Cérebro, memória e estratégia da rodada</p>
            </div>
          </Link>

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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col">{children}</main>

      <footer className="border-t border-border px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>BOB v0.1.0 · cutoff por rodada · memória autônoma em camadas · admin de integrações</p>
          <p className="font-mono">apps/web</p>
        </div>
      </footer>
    </div>
  );
}