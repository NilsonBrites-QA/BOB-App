/**
 * BOB — Cache Gate (Guardião de Janelas de Acesso às APIs)
 *
 * Implementa a política de cache de 3 camadas definida no PRD Mestre (Seção 9).
 * Toda requisição a uma API externa DEVE passar por este módulo antes de ser
 * executada. Ele é a única fonte de verdade sobre "quando é permitido chamar o quê".
 *
 * ─── Camadas ──────────────────────────────────────────────────────────────────
 *
 * LAYER 1 — TheSportsDB (assets visuais: logos, escudos, banners)
 *   Política: sync ÚNICO por time. Uma vez armazenado no banco, nunca re-consulta
 *   a API externa. Não há expiração — escudos não mudam entre temporadas.
 *   Gatilho: checkTheSportsDB(teamId, hasDbRecord)
 *
 * LAYER 2 — football-data.org (tabela de classificação e calendário)
 *   Política: máximo 1 chamada a cada 24 horas por competition/endpoint.
 *   Razão: taxa gratuita de 10 req/min; calendário e standings mudam 1x/dia.
 *   Gatilho: checkFootballData(cacheKey, lastSyncedAt?)
 *
 * LAYER 3 — API-Football "O Bisturi" (estatísticas cirúrgicas por janela)
 *   Política: exatamente 3 janelas em relação ao kickoff do jogo alvo:
 *
 *     • T-48h: abre 48h antes, fecha 36h antes do kickoff (janela de 12h)
 *              Objetivo: buscar odds base + fixtures confirmados da rodada.
 *
 *     • T-24h: abre 24h antes, fecha 12h antes do kickoff (janela de 12h)
 *              Objetivo: atualizar predições + estatísticas recentes de time.
 *
 *     • T-1h:  abre 90min antes, fecha no exato kickoff (janela de 90min)
 *              Objetivo: escalações oficiais — recalibração de emergência.
 *              É a única janela que pode gerar um alerta de rebaixamento de
 *              confiança da Âncora ("Sinal interrompido. Recalibrando...").
 *
 *   FORA dessas janelas: chamada bloqueada. Cache existente é retornado.
 *   Gatilho: checkApiFootball(cacheKey, kickoffAt, lastSyncedAt?)
 *
 * LAYER 3b — OddsPapi (odds Pinnacle via proxy)
 *   Política: revalidação máxima a cada 3h. Odds pré-jogo são estáveis em
 *   janelas curtas; chamar mais que isso é desperdício de quota.
 *   Após o kickoff, as odds devem ser congeladas (não re-verificar).
 *   Gatilho: checkOddsPapi(cacheKey, lastSyncedAt?)
 *
 * ─── Invariante de Segurança ──────────────────────────────────────────────────
 *
 *   Uma decisão BLOQUEADA (allowed: false) NÃO é erro — é comportamento esperado.
 *   O conector que receber `{ allowed: false }` DEVE retornar o cache mais recente
 *   disponível sem lançar exceção. A aplicação nunca quebra por janela fechada.
 *
 * ─── L1 vs L2 Cache ───────────────────────────────────────────────────────────
 *
 *   L1 (este módulo): Map em memória. Volátil — reseta a cada cold start do
 *       servidor (deploy, restart). Suficiente para evitar duplicatas em
 *       requisições paralelas na mesma sessão de servidor.
 *
 *   L2 (banco Postgres): model `ApiSyncLog` (adicionado na etapa 2 da Fase 1,
 *       migration 005_assets_cache.sql). Persistente — sobrevive a restarts.
 *       Os conectores passam `lastSyncedAt` do banco para este módulo; o banco
 *       tem sempre prioridade sobre o Map em memória.
 */

// ─── Constantes das Janelas (em milissegundos) ────────────────────────────────

/** Layer 2: intervalo mínimo entre sincronizações de football-data.org */
const FOOTBALL_DATA_MIN_MS = 24 * 60 * 60 * 1000; // 24 horas

/** Layer 3b: intervalo mínimo entre atualizações de odds via OddsPapi */
const ODDSPAPI_MIN_MS = 3 * 60 * 60 * 1000; // 3 horas

/**
 * Definição matemática das 3 janelas da API-Football em relação ao kickoff.
 *
 * Cada entrada: [openOffsetMs, closeOffsetMs]
 *   Valores negativos = antes do kickoff
 *   Zero = exatamente no kickoff
 *
 * Exemplo concreto com kickoff às 21h00:
 *   T-48h → abre às 21h00 do D-2 e fecha às 09h00 do D-1
 *   T-24h → abre às 21h00 do D-1 e fecha às 09h00 do D+0
 *   T-1h  → abre às 19h30 do D+0 e fecha às 21h00 do D+0
 */
const WINDOWS = {
  "T-48h": {
    openOffsetMs:  -48 * 60 * 60 * 1000, // kickoff - 48h
    closeOffsetMs: -36 * 60 * 60 * 1000, // kickoff - 36h
    description:   "Odds base + fixtures (48h → 36h antes do kickoff)",
  },
  "T-24h": {
    openOffsetMs:  -24 * 60 * 60 * 1000, // kickoff - 24h
    closeOffsetMs: -12 * 60 * 60 * 1000, // kickoff - 12h
    description:   "Predições + estatísticas de time (24h → 12h antes do kickoff)",
  },
  "T-1h": {
    openOffsetMs:  -90 * 60 * 1000, // kickoff - 90min
    closeOffsetMs: 0,               // até o instante do kickoff
    description:   "Escalações oficiais — recalibração de emergência (90min → kickoff)",
  },
} as const;

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ApiSource = "thesportsdb" | "football-data" | "api-football" | "oddspapi";

export type WindowName = keyof typeof WINDOWS;

export type CacheDecision = {
  /** true = chamada à API externa autorizada agora */
  allowed: boolean;
  /** Nome da janela ativa (exclusivo para source=api-football) */
  activeWindow: WindowName | null;
  /** Mensagem de auditoria — logável pelo conector */
  reason: string;
};

export type WindowDiagnostic = {
  kickoffAt: string;
  nowAt: string;
  activeWindow: WindowName | null;
  msToNextWindow: number;
  windows: Record<
    WindowName,
    { opensAt: string; closesAt: string; isActive: boolean; description: string }
  >;
};

// ─── Estado L1 (in-memory, volátil) ──────────────────────────────────────────

/**
 * Mapa de sincronizações realizadas nesta sessão de servidor.
 * Chave de formato: `"${source}:${cacheKey}"` — ex: "football-data:BSA-2026-round-10"
 * Para API-Football, a janela é incorporada na chave:
 *   "api-football:lineups-fixture-123456:T-1h"
 *
 * Valor: timestamp (ms) da última sincronização bem-sucedida.
 */
const _l1: Map<string, number> = new Map();

// ─── Funções internas ─────────────────────────────────────────────────────────

/**
 * Determina qual janela de API-Football está aberta no instante `now`
 * em relação ao `kickoffAt` informado.
 *
 * Retorna o nome da janela ativa ou null se nenhuma estiver aberta.
 * O cálculo é puramente aritmético: não há I/O.
 */
function detectActiveWindow(kickoffAt: Date, now: Date): WindowName | null {
  const kickMs = kickoffAt.getTime();
  const nowMs  = now.getTime();

  for (const name of Object.keys(WINDOWS) as WindowName[]) {
    const cfg        = WINDOWS[name];
    const windowOpen = kickMs + cfg.openOffsetMs;
    const windowCls  = kickMs + cfg.closeOffsetMs;

    if (nowMs >= windowOpen && nowMs <= windowCls) {
      return name;
    }
  }

  return null;
}

/**
 * Retorna o timestamp mais recente de uma sincronização: prioriza o banco (L2)
 * sobre a memória (L1), pois o banco sobrevive a restarts de servidor.
 *
 * @param l1Key        - Chave para buscar no Map L1
 * @param lastSyncedAt - Timestamp do banco (L2), se disponível
 */
function resolveLastMs(l1Key: string, lastSyncedAt: Date | null | undefined): number {
  const l2Ms = lastSyncedAt ? lastSyncedAt.getTime() : 0;
  const l1Ms = _l1.get(l1Key) ?? 0;
  // L2 tem prioridade — mais confiável por sobreviver a cold starts
  return Math.max(l1Ms, l2Ms);
}

// ─── API pública: decisões de cache ──────────────────────────────────────────

/**
 * Decide se uma chamada cirúrgica à API-Football é permitida agora.
 *
 * Lógica:
 *   1. Detecta qual janela temporal está ativa para o kickoff informado.
 *   2. Se nenhuma janela estiver aberta → BLOQUEADO (fora de contrato).
 *   3. Se a janela está aberta mas já foi sincronizada dentro dela → BLOQUEADO.
 *   4. Janela aberta + ainda não sincronizada nesta janela → AUTORIZADO.
 *
 * A "janela já sincronizada" é determinada comparando o último timestamp de
 * sync com o instante de abertura da janela atual. Se `lastMs >= windowOpenMs`,
 * o sync ocorreu dentro da janela vigente e não há necessidade de repetir.
 *
 * @param cacheKey     - Partícula identificadora do endpoint
 *                       Ex: "fixtures-round-10", "lineups-fixture-123456"
 * @param kickoffAt    - Data/hora UTC do jogo mais próximo da rodada
 * @param lastSyncedAt - (Opcional) último sync registrado no banco para este
 *                       cacheKey + janela (passado pelo conector via L2)
 * @param now          - (Injetável para testes unitários) instante atual
 */
export function checkApiFootball(
  cacheKey: string,
  kickoffAt: Date,
  lastSyncedAt?: Date | null,
  now = new Date()
): CacheDecision {
  const activeWindow = detectActiveWindow(kickoffAt, now);

  if (!activeWindow) {
    const nextMs = msToNextWindow(kickoffAt, now);
    const hoursToNext = Math.ceil(nextMs / (60 * 60 * 1000));
    return {
      allowed:      false,
      activeWindow: null,
      reason:
        `[API-Football] Fora de janela para "${cacheKey}". ` +
        `Kickoff: ${kickoffAt.toISOString()}. ` +
        (nextMs > 0
          ? `Próxima janela em ~${hoursToNext}h. Usando cache existente.`
          : "Todas as janelas já passaram. Usando cache imutável."),
    };
  }

  // Chave L1 inclui a janela para distinguir syncs de janelas diferentes
  const l1Key  = `api-football:${cacheKey}:${activeWindow}`;
  const lastMs = resolveLastMs(l1Key, lastSyncedAt);

  // "Janela já sincronizada" = o último sync ocorreu APÓS a abertura desta janela
  const windowOpenMs = kickoffAt.getTime() + WINDOWS[activeWindow].openOffsetMs;
  if (lastMs >= windowOpenMs) {
    return {
      allowed:      false,
      activeWindow,
      reason:
        `[API-Football] Janela ${activeWindow} já foi sincronizada em ` +
        `${new Date(lastMs).toISOString()} para "${cacheKey}". Usando cache.`,
    };
  }

  return {
    allowed:      true,
    activeWindow,
    reason:
      `[API-Football] Janela ${activeWindow} aberta. ` +
      `${WINDOWS[activeWindow].description}. Sincronização autorizada para "${cacheKey}".`,
  };
}

/**
 * Decide se uma chamada à football-data.org é permitida agora.
 *
 * Throttle rígido de 24h por endpoint. Razão: calendário e standings mudam
 * no máximo uma vez ao dia; re-sincronizar mais do que isso é desperdício de
 * quota (10 req/min no plano free) sem ganho de precisão.
 *
 * @param cacheKey     - Identificador do endpoint (ex: "BSA-2026-standings")
 * @param lastSyncedAt - (Opcional) último sync registrado no banco
 */
export function checkFootballData(
  cacheKey: string,
  lastSyncedAt?: Date | null
): CacheDecision {
  const l1Key  = `football-data:${cacheKey}`;
  const lastMs = resolveLastMs(l1Key, lastSyncedAt);
  const ageMs  = Date.now() - lastMs;

  if (ageMs < FOOTBALL_DATA_MIN_MS) {
    const hoursLeft = Math.ceil((FOOTBALL_DATA_MIN_MS - ageMs) / (60 * 60 * 1000));
    return {
      allowed:      false,
      activeWindow: null,
      reason:
        `[football-data] Cache válido por mais ~${hoursLeft}h para "${cacheKey}". Usando cache.`,
    };
  }

  return {
    allowed:      true,
    activeWindow: null,
    reason:
      `[football-data] Cache expirado (${Math.floor(ageMs / (60 * 60 * 1000))}h atrás) ` +
      `para "${cacheKey}". Sincronização autorizada.`,
  };
}

/**
 * Decide se uma atualização de odds via OddsPapi é permitida agora.
 *
 * Throttle de 3h por fixture. Odds Pinnacle pré-jogo movem-se lentamente;
 * atualizações mais frequentes não aumentam precisão do Anchor Score e
 * consomem quota desnecessariamente.
 *
 * @param cacheKey     - Identificador do fixture (ex: "oddspapi-325-fixture-999")
 * @param lastSyncedAt - (Opcional) último sync registrado no banco
 */
export function checkOddsPapi(
  cacheKey: string,
  lastSyncedAt?: Date | null
): CacheDecision {
  const l1Key  = `oddspapi:${cacheKey}`;
  const lastMs = resolveLastMs(l1Key, lastSyncedAt);
  const ageMs  = Date.now() - lastMs;

  if (ageMs < ODDSPAPI_MIN_MS) {
    const minsLeft = Math.ceil((ODDSPAPI_MIN_MS - ageMs) / 60_000);
    return {
      allowed:      false,
      activeWindow: null,
      reason:
        `[OddsPapi] Odds recentes para "${cacheKey}" (expiram em ~${minsLeft}min). Usando cache.`,
    };
  }

  return {
    allowed:      true,
    activeWindow: null,
    reason:
      `[OddsPapi] Cache de odds expirado para "${cacheKey}". Sincronização autorizada.`,
  };
}

/**
 * Decide se um asset do TheSportsDB precisa ser buscado na API.
 *
 * Política DB-first absoluta:
 *   Se o time já possui logo/escudo armazenado no banco → NUNCA re-consultar.
 *   Se não possui → sincronizar UMA VEZ e persistir permanentemente.
 *   Não há TTL; logos de times não mudam entre temporadas.
 *
 * @param teamId      - ID do time no TheSportsDB (ex: "133613")
 * @param hasDbRecord - true se o banco (`team_assets`) já possui este time
 */
export function checkTheSportsDB(
  teamId: string | number,
  hasDbRecord: boolean
): CacheDecision {
  if (hasDbRecord) {
    return {
      allowed:      false,
      activeWindow: null,
      reason:
        `[TheSportsDB] Asset do time ${teamId} já persistido no banco (DB-first ativo). ` +
        `Nenhuma chamada externa necessária.`,
    };
  }

  return {
    allowed:      true,
    activeWindow: null,
    reason:
      `[TheSportsDB] Nenhum asset encontrado para time ${teamId}. ` +
      `Sincronização única autorizada.`,
  };
}

// ─── Registro de sincronização (L1) ──────────────────────────────────────────

/**
 * Registra uma sincronização bem-sucedida no cache L1 (memória).
 *
 * DEVE ser chamado pelo conector SOMENTE após uma resposta 2xx da API externa.
 * O conector é responsável por também atualizar o banco (L2) via upsert na
 * tabela `api_sync_log` (model adicionado na etapa 2 da Fase 1).
 *
 * Separação de responsabilidades:
 *   cache-gate.ts  → registra no L1 (imediato, sem I/O)
 *   conector .ts   → persiste no L2 (async, com I/O ao banco)
 *
 * @param source   - Fonte sincronizada
 * @param cacheKey - Chave do endpoint sincronizado
 * @param window   - (Apenas para api-football) janela em que ocorreu o sync
 */
export function recordSync(
  source: ApiSource,
  cacheKey: string,
  window?: WindowName
): void {
  const key = window
    ? `${source}:${cacheKey}:${window}`
    : `${source}:${cacheKey}`;

  _l1.set(key, Date.now());
}

// ─── Utilitários de diagnóstico (BOB Live Brain Console) ──────────────────────

/**
 * Calcula em quantos milissegundos a próxima janela de API-Football abrirá.
 * Retorna 0 se uma janela já estiver ativa.
 *
 * Usado pelo Brain Console para exibir "Próxima janela em Xh".
 */
export function msToNextWindow(kickoffAt: Date, now = new Date()): number {
  if (detectActiveWindow(kickoffAt, now) !== null) return 0;

  const kickMs = kickoffAt.getTime();
  const nowMs  = now.getTime();

  let nearest = Infinity;
  for (const name of Object.keys(WINDOWS) as WindowName[]) {
    const openAtMs = kickMs + WINDOWS[name].openOffsetMs;
    if (openAtMs > nowMs) {
      nearest = Math.min(nearest, openAtMs - nowMs);
    }
  }

  return nearest === Infinity ? 0 : nearest;
}

/**
 * Retorna um diagnóstico completo do estado das janelas para um kickoff.
 * Consumido exclusivamente pelo BOB Live Brain Console (visualização admin).
 * Não deve ser exposto a rotas públicas.
 *
 * @param kickoffAt - Data/hora UTC do jogo alvo
 * @param now       - (Injetável para testes) instante atual
 */
export function diagnoseWindows(
  kickoffAt: Date,
  now = new Date()
): WindowDiagnostic {
  const kickMs = kickoffAt.getTime();
  const active = detectActiveWindow(kickoffAt, now);

  const windows = {} as WindowDiagnostic["windows"];

  for (const name of Object.keys(WINDOWS) as WindowName[]) {
    const cfg = WINDOWS[name];
    windows[name] = {
      opensAt:     new Date(kickMs + cfg.openOffsetMs).toISOString(),
      closesAt:    new Date(kickMs + cfg.closeOffsetMs).toISOString(),
      isActive:    active === name,
      description: cfg.description,
    };
  }

  return {
    kickoffAt:      kickoffAt.toISOString(),
    nowAt:          now.toISOString(),
    activeWindow:   active,
    msToNextWindow: msToNextWindow(kickoffAt, now),
    windows,
  };
}
