"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition-all",
        isActive
          ? "bg-accent text-white shadow-[0_12px_28px_rgba(21,86,61,0.26)]"
          : "bg-transparent text-foreground/90 hover:bg-[rgba(21,86,61,0.08)] hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
