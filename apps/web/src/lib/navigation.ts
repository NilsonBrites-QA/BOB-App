export type AppNavItem = {
  href: string;
  label: string;
};

export type AppNavGroup = {
  id: string;
  label: string;
  items: AppNavItem[];
};

export const APP_NAV_GROUPS: AppNavGroup[] = [
  {
    id: "analise",
    label: "Leitura",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/estatisticas", label: "Estatísticas" },
      { href: "/historico", label: "Histórico" },
    ],
  },
  {
    id: "liga",
    label: "Liga",
    items: [
      { href: "/classificacao", label: "Classificação" },
      { href: "/calendario", label: "Calendário" },
    ],
  },
  {
    id: "ferramentas",
    label: "Ferramentas",
    items: [
      { href: "/apostas", label: "Apostas" },
      { href: "/chat", label: "Chat" },
      { href: "/investimento-retorno", label: "I×R" },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AppNavItem[] = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/cerebro", label: "Cérebro" },
];
