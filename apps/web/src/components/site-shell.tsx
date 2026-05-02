import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { FRONTEND_VERSION, VERSION_STATUS } from "@/lib/frontend-meta";
import { MigrationBanner } from "./migration-banner";

type SiteShellProps = {
  children: React.ReactNode;
};

export async function SiteShell({ children }: SiteShellProps) {
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
    <div className="flex min-h-full flex-col">
      {VERSION_STATUS.migrationPhase && <MigrationBanner />}

      {/* ── Header — Glassmorphism sobre fundo preto ── */}
      <header className="glass sticky top-0 z-50 border-b border-[var(--glass-border)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">

          {/* Logo + nome */}
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/bob-logo.png"
              alt="BOB"
              width={36}
              height={36}
              priority
              className="h-9 w-9 object-contain"
            />
            <div className="leading-tight">
              <p className="text-base font-bold text-foreground">BOB</p>
              <p className="text-[10px] text-muted -mt-0.5 hidden sm:block">
                Big Odds · {FRONTEND_VERSION} · {VERSION_STATUS.shortLabel}
              </p>
            </div>
          </Link>

          {/* Direita: badge admin + toggle tema + menu */}
          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center rounded-md border border-[var(--highlight)]/30 bg-[var(--highlight)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--highlight)]">
                  ADMIN
                </span>
              )}

              {/* ThemeToggle sempre visível no header */}
              <ThemeToggle />

              {/* Menu hamburguer */}
              <MobileNav isAdmin={isAdmin} signOutAction={signOut} />
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        {children}
      </main>

      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 text-center text-[11px] text-muted sm:flex-row sm:text-left">
          <p>BOB v{FRONTEND_VERSION} · Big Odds Brasileirão</p>
          <p>Análise esportiva · não é casa de apostas</p>
        </div>
      </footer>
    </div>
  );
}
