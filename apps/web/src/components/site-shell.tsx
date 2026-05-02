import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { MobileNav } from "@/components/mobile-nav";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";
import { FRONTEND_VERSION, VERSION_STATUS } from "@/lib/frontend-meta";
import { MigrationBanner } from "./migration-banner";

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
    <div className="flex min-h-full flex-col">
      {/* Header Bet365 — verde escuro forte, fixo */}
      {/* Banner de migração — visível em todas as páginas exceto auth */}
      {VERSION_STATUS.migrationPhase && <MigrationBanner />}

      <header className="sticky top-0 z-50 border-b border-[var(--border-strong)] bg-[var(--surface-strong)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/bob-logo.png"
              alt="BOB"
              width={40}
              height={40}
              priority
              className="h-10 w-10 object-contain"
            />
            <div className="leading-tight">
              <p className="text-base font-bold text-foreground">BOB</p>
              <p className="text-[10px] text-muted -mt-0.5">Big Odds · {FRONTEND_VERSION} · {VERSION_STATUS.shortLabel}</p>
            </div>
          </Link>

          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-strong)]">
                  ADMIN
                </span>
              )}
              <MobileNav isAdmin={isAdmin} signOutAction={signOut} />
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        {children}
      </main>

      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 text-center text-[11px] text-muted sm:flex-row sm:text-left">
          <p>BOB v{FRONTEND_VERSION} · Big Odds Brasileirão</p>
          <p>Análise esportiva · não é casa de apostas</p>
        </div>
      </footer>
    </div>
  );
}
