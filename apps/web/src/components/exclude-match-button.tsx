"use client";

/**
 * BOB — Botão de exclusão de jogo
 * Adiciona / remove o ID do match no query param ?excluded= sem recarregar a página completa.
 * O Server Component pai lê o param e refaz o scoring sem o jogo excluído.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  matchId: string;
}

export function ExcludeMatchButton({ matchId }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const excludedParam = searchParams.get("excluded") ?? "";
  const excludedIds   = excludedParam ? excludedParam.split(",").filter(Boolean) : [];
  const isExcluded    = excludedIds.includes(matchId);

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    const next   = isExcluded
      ? excludedIds.filter((id) => id !== matchId)
      : [...excludedIds, matchId];

    if (next.length > 0) params.set("excluded", next.join(","));
    else                  params.delete("excluded");

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isExcluded ? "Restaurar jogo" : "Excluir jogo desta rodada"}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        isExcluded
          ? "border-accent bg-accent/10 text-accent-strong hover:bg-accent/20"
          : "border-border text-muted hover:border-red-400 hover:text-red-600",
      ].join(" ")}
    >
      {isExcluded ? "Restaurar" : "Excluir"}
    </button>
  );
}
