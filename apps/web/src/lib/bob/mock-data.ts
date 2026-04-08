import type {
  AdminControl,
  AnchorCandidate,
  AnchorFactor,
  DailyManifesto,
  FeatureFlag,
  Integration,
  MemoryLayer,
  RoundSnapshot,
  Variation,
} from "@/lib/bob/types";

export const currentRoundSnapshot: RoundSnapshot = {
  label: "Brasileirão Série A · Rodada piloto",
  firstMatchWindow: "Quarta, quinta, sábado, domingo e possível segunda",
  cutoffLabel: "Fechamento oficial até 1h antes do primeiro jogo do bloco inicial",
  deliveryRule:
    "As 5 variações saem com antecedência usando escalações prováveis, notícias, calendário competitivo e dados analíticos consolidados.",
  confirmedLineupPolicy:
    "Escalações confirmadas posteriores entram como memória, auditoria e alerta secundário para jogos ainda não iniciados.",
  anchorRule:
    "4 âncoras por rodada, presentes em pelo menos 3 variações e juntas em pelo menos 1 múltipla.",
};

export const integrations: Integration[] = [
  {
    name: "TheSportsDB",
    role: "Assets visuais, H2H básico e perfil de equipes",
    quota: "Ilimitado",
    cachePolicy: "Cache permanente após sincronização inicial",
    status: "connected",
  },
  {
    name: "football-data.org",
    role: "Tabela, calendário, forma recente e estrutura da competição",
    quota: "10 req/min",
    cachePolicy: "Refresh diário com snapshot por rodada",
    status: "connected",
  },
  {
    name: "API-Football",
    role: "Odds, prováveis, lesões, suspensões e contexto dinâmico",
    quota: "Planejamento: 9 req/rodada no pior caso",
    cachePolicy: "Cache por janela T-48h, T-24h e cutoff",
    status: "planned",
  },
];

export const anchorFactors: AnchorFactor[] = [
  {
    label: "Posição e contexto da tabela",
    weight: 15,
    description: "Peso do momento competitivo, risco de poupar e necessidade real de pontuar.",
  },
  {
    label: "Resultados recentes",
    weight: 12,
    description: "Últimos jogos em sequência, consistência do momento e estabilidade do time.",
  },
  {
    label: "Casa x fora",
    weight: 12,
    description: "Desempenho específico como mandante e visitante nas últimas partidas.",
  },
  {
    label: "Gols e xG recente",
    weight: 18,
    description: "Produção ofensiva e defensiva em volume e qualidade.",
  },
  {
    label: "Confronto direto histórico",
    weight: 8,
    description: "Condição do duelo e padrão de resposta entre as equipes.",
  },
  {
    label: "Desfalques e suspensões",
    weight: 15,
    description: "Impacto real do elenco indisponível, não apenas contagem bruta.",
  },
  {
    label: "Calendário competitivo",
    weight: 10,
    description: "Libertadores, Copa do Brasil, Sul-Americana e risco de poupar titulares.",
  },
  {
    label: "Mercado e movimento de odd",
    weight: 10,
    description: "Leitura de valor e distorções relevantes da casa de aposta.",
  },
];

export const anchors: AnchorCandidate[] = [
  {
    team: "Flamengo",
    opponent: "Juventude",
    score: 82,
    reasons: [
      "Melhor momento recente e mando forte",
      "Elenco titular projetado sem perdas críticas",
      "Pressão por resultado antes de confronto decisivo",
    ],
  },
  {
    team: "Palmeiras",
    opponent: "Vitória",
    score: 79,
    reasons: [
      "Produção ofensiva superior nas últimas partidas",
      "Histórico de controle do confronto",
      "Visitante com queda fora de casa",
    ],
  },
  {
    team: "Botafogo",
    opponent: "Cuiabá",
    score: 76,
    reasons: [
      "Sequência recente consistente",
      "Adversário com menor criação ofensiva",
      "Contexto da rodada favorece manutenção de força máxima",
    ],
  },
  {
    team: "Cruzeiro",
    opponent: "Atlético-GO",
    score: 72,
    reasons: [
      "Melhor recorte casa x fora",
      "Adversário com desgaste elevado",
      "Volatilidade aceitável para composição de âncora",
    ],
  },
];

export const variations: Variation[] = [
  {
    id: "V1",
    title: "Segurança",
    posture: "Todos os 4 âncoras vencem e a rodada fica mais enxuta.",
    projectedOdd: 1186,
    gameCount: 8,
    anchorsTogether: true,
    summary:
      "Leitura de rodada mais limpa, cortando jogos com contexto mais nebuloso para preservar força estrutural.",
    picks: [
      { match: "Flamengo x Juventude", result: "1", odd: 1.44, isAnchor: true },
      { match: "Palmeiras x Vitória", result: "1", odd: 1.55, isAnchor: true },
      { match: "Botafogo x Cuiabá", result: "1", odd: 1.67, isAnchor: true },
      { match: "Cruzeiro x Atlético-GO", result: "1", odd: 1.74, isAnchor: true },
      { match: "Bahia x Corinthians", result: "X", odd: 3.05 },
      { match: "Fortaleza x Athletico-PR", result: "1", odd: 1.98 },
      { match: "Bragantino x Grêmio", result: "1", odd: 2.02 },
      { match: "Internacional x Vasco", result: "1", odd: 1.92 },
    ],
  },
  {
    id: "V2",
    title: "Equilíbrio",
    posture: "Âncoras fortes com empates em jogos de score intermediário.",
    projectedOdd: 1542,
    gameCount: 9,
    anchorsTogether: false,
    summary:
      "Aposta em empate onde o confronto tem tendência a travar o valor esperado e ainda sustenta as âncoras centrais.",
    picks: [
      { match: "Flamengo x Juventude", result: "1", odd: 1.44, isAnchor: true },
      { match: "Palmeiras x Vitória", result: "1", odd: 1.55, isAnchor: true },
      { match: "Botafogo x Cuiabá", result: "1", odd: 1.67, isAnchor: true },
      { match: "Cruzeiro x Atlético-GO", result: "X", odd: 3.10 },
      { match: "Bahia x Corinthians", result: "X", odd: 3.05 },
      { match: "Fortaleza x Athletico-PR", result: "1", odd: 1.98 },
      { match: "Bragantino x Grêmio", result: "X", odd: 3.18 },
      { match: "Internacional x Vasco", result: "1", odd: 1.92 },
      { match: "Fluminense x São Paulo", result: "1", odd: 2.08 },
    ],
  },
  {
    id: "V3",
    title: "Lógica Pura",
    posture: "A rodada responde ao favoritismo e os 4 pilares confirmam ao mesmo tempo.",
    projectedOdd: 2018,
    gameCount: 9,
    anchorsTogether: true,
    summary:
      "Variação central do método: todos os favoritos principais vencem e a leitura da rodada confirma o recorte mais racional.",
    picks: [
      { match: "Flamengo x Juventude", result: "1", odd: 1.44, isAnchor: true },
      { match: "Palmeiras x Vitória", result: "1", odd: 1.55, isAnchor: true },
      { match: "Botafogo x Cuiabá", result: "1", odd: 1.67, isAnchor: true },
      { match: "Cruzeiro x Atlético-GO", result: "1", odd: 1.74, isAnchor: true },
      { match: "Bahia x Corinthians", result: "1", odd: 2.14 },
      { match: "Fortaleza x Athletico-PR", result: "1", odd: 1.98 },
      { match: "Bragantino x Grêmio", result: "1", odd: 2.02 },
      { match: "Internacional x Vasco", result: "1", odd: 1.92 },
      { match: "Fluminense x São Paulo", result: "X", odd: 3.12 },
    ],
  },
  {
    id: "V4",
    title: "Curta de pressão",
    posture: "Menos jogos, mas odd ainda alta para um cenário de corte seletivo.",
    projectedOdd: 864,
    gameCount: 7,
    anchorsTogether: false,
    summary:
      "Remove parte dos confrontos mais sujos da rodada e força um pacote mais agressivo em valor por seleção.",
    picks: [
      { match: "Flamengo x Juventude", result: "1", odd: 1.44, isAnchor: true },
      { match: "Palmeiras x Vitória", result: "1", odd: 1.55, isAnchor: true },
      { match: "Botafogo x Cuiabá", result: "1", odd: 1.67, isAnchor: true },
      { match: "Bahia x Corinthians", result: "X", odd: 3.05 },
      { match: "Fortaleza x Athletico-PR", result: "1", odd: 1.98 },
      { match: "Bragantino x Grêmio", result: "2", odd: 3.42 },
      { match: "Fluminense x São Paulo", result: "1", odd: 2.08 },
    ],
  },
  {
    id: "V5",
    title: "Extrema",
    posture: "Rodada com mais fricção, mais empates e pontos de ruptura controlados.",
    projectedOdd: 3124,
    gameCount: 10,
    anchorsTogether: false,
    summary:
      "Variação de estresse do método, preservando o eixo das âncoras mas aceitando mais travas e um desenho mais raro.",
    picks: [
      { match: "Flamengo x Juventude", result: "1", odd: 1.44, isAnchor: true },
      { match: "Palmeiras x Vitória", result: "1", odd: 1.55, isAnchor: true },
      { match: "Botafogo x Cuiabá", result: "X", odd: 3.32 },
      { match: "Cruzeiro x Atlético-GO", result: "1", odd: 1.74, isAnchor: true },
      { match: "Bahia x Corinthians", result: "X", odd: 3.05 },
      { match: "Fortaleza x Athletico-PR", result: "X", odd: 3.16 },
      { match: "Bragantino x Grêmio", result: "2", odd: 3.42 },
      { match: "Internacional x Vasco", result: "1", odd: 1.92 },
      { match: "Fluminense x São Paulo", result: "X", odd: 3.12 },
      { match: "Atlético-MG x Santos", result: "X", odd: 3.08 },
    ],
  },
];

export const memoryLayers: MemoryLayer[] = [
  {
    name: "Memória bruta total",
    retention: "Integral",
    purpose: "Guardar eventos, snapshots, odds, notícias e contexto por fonte e horário.",
    motorUsage: "Nunca é usada diretamente sem normalização.",
  },
  {
    name: "Memória normalizada",
    retention: "Integral com versionamento",
    purpose: "Estruturar rodada, time, confronto, elenco, arbitragem e calendário competitivo.",
    motorUsage: "É a principal camada operacional do motor.",
  },
  {
    name: "Memória de padrões",
    retention: "Persistente",
    purpose: "Consolidar desvios, recorrências, surpresa de resultado e sinais condicionais.",
    motorUsage: "Só entra quando o padrão já foi validado por recorrência e contexto.",
  },
  {
    name: "Memória de decisão",
    retention: "Persistente",
    purpose: "Registrar por que cada bilhete nasceu, mudou ou foi mantido.",
    motorUsage: "Usada para auditoria, aprendizado e interface do chatbot.",
  },
];

export const adminControls: AdminControl[] = [
  {
    title: "Integrações",
    value: "3 fontes priorizadas",
    note: "Controle de chaves, janelas, custo e fallback por conector.",
  },
  {
    title: "Cache profundo",
    value: "Análise por snapshot",
    note: "Evita repetir prompt e leitura quando os mesmos dados já foram consolidados.",
  },
  {
    title: "Governança",
    value: "Prompts e pesos versionados",
    note: "Cada mudança precisa ficar rastreável no admin.",
  },
  {
    title: "Memória",
    value: "Camadas administráveis",
    note: "Retenção total no armazenamento com uso seletivo no motor.",
  },
];

export const featureFlags: FeatureFlag[] = [
  {
    name: "Camada quântica na abertura",
    enabled: true,
    note: "Ritual de saudação diária sem tocar no motor de decisão.",
  },
  {
    name: "Extras acima de 5 variações",
    enabled: true,
    note: "Somente sob demanda do usuário.",
  },
  {
    name: "Chatbot com o mesmo cérebro",
    enabled: true,
    note: "Interface conversacional compartilhando memória e auditoria.",
  },
  {
    name: "Entrega dependente de lineup confirmada",
    enabled: false,
    note: "A rodada principal não espera confirmação tardia de escalações.",
  },
];

export const dailyManifesto: DailyManifesto = {
  dailyOpening:
    "Hoje o BOB já nasce com um compromisso: buscar as melhores BIG ODDS com foco, memória e disciplina. A convicção aparece na entrega, não no improviso do cálculo.",
  deliverySignature:
    "Se você acredita no processo, entre com intenção e clareza. Não perca tempo tentando a sorte; ganhe tempo construindo o melhor cenário possível.",
};