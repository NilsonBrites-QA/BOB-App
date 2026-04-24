import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { FRONTEND_SURFACE, FRONTEND_VERSION } from "@/lib/frontend-meta";
import { ADMIN_NAV_ITEMS, APP_NAV_GROUPS } from "@/lib/navigation";

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
      <header className="sticky top-0 z-30 border-b border-border bg-surface/88 backdrop-blur-2xl">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-3 rounded-full border border-border/80 bg-background/45 px-2 py-2 pr-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur"
            >
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-surface-strong">
                <Image
                  src="/bob-logo.png"
                  alt="BOB"
                  width={44}
                  height={44}
                  priority
                />
              </div>
              <div className="min-w-0">
                <p className="kicker text-[10px] text-muted">Big Odds Brasileirão</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold tracking-tight">BOB</span>
                  <span className="rounded-full border border-border/80 bg-surface-strong px-2 py-0.5 font-mono text-[10px] text-muted">
                    {FRONTEND_VERSION}
                  </span>
                </div>
              </div>
            </Link>

            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 lg:flex">
                  <span className="rounded-full border border-border/80 bg-background/45 px-3 py-1 text-[11px] text-muted">
                    {FRONTEND_SURFACE}
                  </span>
                  {isAdmin && (
                    <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent-strong">
                      acesso admin ativo
                    </span>
                  )}
                </div>
                <div className="hidden md:block">
                  <ThemeToggle />
                </div>
                <form action={signOut} className="hidden md:block">
                  <button
                    type="submit"
                    className="rounded-full border border-border px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Sair
                  </button>
                </form>
                <MobileNav isAdmin={isAdmin} signOutAction={signOut} />
              </div>
            ) : null}
          </div>

          {isLoggedIn && (
            <div className="mt-4 hidden gap-3 lg:flex lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                {APP_NAV_GROUPS.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 overflow-x-auto rounded-[22px] border border-border/80 bg-background/40 px-3 py-2"
                  >
                    <span className="kicker shrink-0 text-[10px] text-muted">{group.label}</span>
                    <div className="flex items-center gap-1.5">
                      {group.items.map((item) => (
                        <NavLink key={item.href} href={item.href}>
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1 rounded-[22px] border border-border/80 bg-background/40 p-1.5">
                  {ADMIN_NAV_ITEMS.map((item) => (
                    <NavLink key={item.href} href={item.href}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col pb-12">{children}</main>

      <footer className="mt-8 border-t border-border px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-4 rounded-[28px] border border-border/80 bg-surface/70 px-5 py-5 text-sm text-muted backdrop-blur md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="kicker text-[10px] text-muted">BOB</p>
            <p className="mt-2 text-sm leading-7">
              {FRONTEND_SURFACE}. Leitura orientada por contexto, disciplina de entrada e integração com a rodada.
            </p>
          </div>
          <div className="space-y-2 md:text-right">
            <p>Versão {FRONTEND_VERSION}</p>
            <p className="font-mono">apps/web</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
