"use client";

/**
 * BOB Live Brain Console — Componente Visual do Grafo Cognitivo
 *
 * PRD §11: "Renderização via WebGL (React Flow ou ForceGraph2D) sobre fundo
 * escuro (Dark Mode) e painéis laterais em Glassmorphism."
 *
 * ─── Arquitetura do Componente ────────────────────────────────────────────────
 *
 *   <BrainGraph>
 *     ├── <ForceGraph2D>     — Canvas WebGL, SSR: false (usa window/Canvas)
 *     ├── <ControlsPanel>   — Top-left, Glassmorphism — season / rounds selector
 *     ├── <HoverTooltip>    — Segue o mouse com label + cor do nó
 *     ├── <DetailPanel>     — Top-right, Glassmorphism — detalhes do nó selecionado
 *     └── <Legend>          — Bottom-left, Glassmorphism — legenda por grupo
 *
 * ─── Decisão de SSR ────────────────────────────────────────────────────────────
 *
 * `react-force-graph-2d` usa `canvas` e `window` internamente — incompatível
 * com SSR. OBRIGATÓRIO: `dynamic(..., { ssr: false })` (Next.js App Router).
 * O import de TIPOS (`import type`) é seguro pois é apagado pelo compilador.
 *
 * ─── Anti-leakage de tipos do servidor ─────────────────────────────────────────
 *
 * Os tipos GraphNode/GraphLink são REDEFINIDOS aqui (não importados de route.ts)
 * para evitar que o bundler do cliente tente incluir código server-only
 * (prisma, supabase, cookies) que está no mesmo arquivo da API route.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ForceGraphProps } from "react-force-graph-2d";

// ─── Dynamic import — SSR desabilitado ───────────────────────────────────────
// ForceGraph2D usa CanvasRenderingContext2D e window — não funciona no servidor.
const ForceGraph2D = dynamic<ForceGraphProps>(
  () => import("react-force-graph-2d"),
  { ssr: false },
);

// ─── Tipos (espelho dos tipos da API route, sem imports server-only) ──────────

type GraphNodeType =
  | "season"
  | "round"
  | "sync"
  | "pattern"
  | "simulation"
  | "memory";

type GraphNodeGroup =
  | "core"
  | "perception"
  | "analytic"
  | "execution"
  | "event";

type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  group: GraphNodeGroup;
  color: string;
  size: number;
  meta: Record<string, unknown>;
  createdAt: string;
  // Adicionados pelo ForceGraph2D em runtime:
  x?: number;
  y?: number;
};

type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
  type: string;
  color: string;
};

type GraphPayload = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    season: number;
    roundsIncluded: number;
    generatedAt: string;
    nodeCounts: Record<string, number>;
  };
};

// ─── Constantes Visuais ───────────────────────────────────────────────────────

const GROUP_LABELS: Record<GraphNodeGroup, string> = {
  core: "Core (Rodadas)",
  perception: "Percepção (APIs)",
  analytic: "Analítico (Reflexões)",
  execution: "Execução (Simulações)",
  event: "Log Cognitivo",
};

const GROUP_COLORS: Record<GraphNodeGroup, string> = {
  core: "#e2e8f0",
  perception: "#38bdf8",
  analytic: "#a78bfa",
  execution: "#34d399",
  event: "#64748b",
};

const TYPE_LABELS: Record<GraphNodeType, string> = {
  season: "Temporada",
  round: "Rodada",
  sync: "Sync de API",
  pattern: "Padrão Condicional",
  simulation: "Simulação Cega",
  memory: "Evento de Memória",
};

// ─── Estilos Glassmorphism ─────────────────────────────────────────────────────

function glassPanel(overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    position: "absolute",
    background: "rgba(2, 6, 23, 0.55)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "14px",
    padding: "1.25rem",
    color: "#e2e8f0",
    fontFamily:
      "var(--font-space-grotesk, 'Inter', system-ui, -apple-system, sans-serif)",
    zIndex: 100,
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    ...overrides,
  };
}

const selectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px",
  color: "#e2e8f0",
  fontSize: "12px",
  padding: "4px 8px",
  outline: "none",
  cursor: "pointer",
  flex: 1,
  appearance: "none" as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
}

// ─── Sub-componentes puros ────────────────────────────────────────────────────

function HoverTooltip({
  node,
  x,
  y,
}: {
  node: GraphNode;
  x: number;
  y: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: x + 18,
        top: y - 14,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        padding: "6px 12px",
        color: "#e2e8f0",
        fontSize: "12px",
        fontFamily:
          "var(--font-space-grotesk, 'Inter', system-ui, sans-serif)",
        pointerEvents: "none",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: node.color,
          flexShrink: 0,
          boxShadow: `0 0 6px ${node.color}`,
        }}
      />
      <span style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
        {node.label}
      </span>
      <span style={{ color: "#475569" }}>
        {TYPE_LABELS[node.type] ?? node.type}
      </span>
    </div>
  );
}

function DetailPanel({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  const metaEntries = [
    ["id", node.id],
    ["tipo", TYPE_LABELS[node.type] ?? node.type],
    ["grupo", GROUP_LABELS[node.group] ?? node.group],
    ["criado em", new Date(node.createdAt).toLocaleString("pt-BR")],
    ...Object.entries(node.meta).filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    ),
  ] as [string, unknown][];

  return (
    <div
      style={glassPanel({
        top: "1.5rem",
        right: "1.5rem",
        width: "340px",
        maxHeight: "calc(100vh - 3rem)",
        overflowY: "auto",
        // Scrollbar estilizada
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.1) transparent",
      })}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "1rem",
          gap: "8px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "4px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: node.color,
                flexShrink: 0,
                boxShadow: `0 0 8px ${node.color}`,
              }}
            />
            <span
              style={{
                fontSize: "10px",
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {GROUP_LABELS[node.group] ?? node.group}
            </span>
          </div>
          <h3
            style={{
              color: "#f1f5f9",
              fontSize: "15px",
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.4,
              wordBreak: "break-word" as const,
            }}
          >
            {node.label}
          </h3>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "4px 9px",
            fontSize: "13px",
            flexShrink: 0,
            lineHeight: 1,
            transition: "background 0.15s",
          }}
          aria-label="Fechar painel de detalhes"
        >
          ✕
        </button>
      </div>

      {/* Type badge */}
      <div style={{ marginBottom: "1rem" }}>
        <span
          style={{
            display: "inline-block",
            background: node.color + "18",
            border: `1px solid ${node.color}38`,
            borderRadius: "6px",
            padding: "2px 10px",
            fontSize: "11px",
            color: node.color,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {node.type}
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          marginBottom: "1rem",
        }}
      />

      {/* Meta entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {metaEntries.map(([key, value]) => (
          <div key={key}>
            <div
              style={{
                fontSize: "10px",
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "3px",
              }}
            >
              {humanizeKey(key)}
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#cbd5e1",
                lineHeight: 1.5,
                wordBreak: "break-all" as const,
              }}
            >
              {formatMetaValue(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div
      style={glassPanel({
        bottom: "1.5rem",
        left: "1.5rem",
        padding: "1rem 1.25rem",
      })}
    >
      <div
        style={{
          fontSize: "10px",
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "0.75rem",
        }}
      >
        Lobos Cognitivos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {(Object.keys(GROUP_LABELS) as GraphNodeGroup[]).map((group) => (
          <div
            key={group}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: GROUP_COLORS[group],
                flexShrink: 0,
                boxShadow: `0 0 5px ${GROUP_COLORS[group]}`,
              }}
            />
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              {GROUP_LABELS[group]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────

export function BrainGraph({ initialSeason }: { initialSeason: number }) {
  const [season, setSeason] = useState<number>(initialSeason);
  const [roundsLimit, setRoundsLimit] = useState<number>(10);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 1280, height: 900 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch de dados ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setSelectedNode(null);

      try {
        const r = await fetch(
          `/api/brain/graph?season=${season}&rounds=${roundsLimit}`,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as GraphPayload;
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sinal interrompido.");
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [season, roundsLimit]);

  // ── Dimensões responsive ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    setDimensions({ width: el.offsetWidth, height: el.offsetHeight });

    return () => observer.disconnect();
  }, []);

  // ── Mouse tracking para tooltip ──────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  // ── Handlers de interação ────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: object) => {
    setSelectedNode(node as GraphNode);
  }, []);

  const handleNodeHover = useCallback(
    (node: object | null) => {
      setHoveredNode(node ? (node as GraphNode) : null);
      if (containerRef.current) {
        containerRef.current.style.cursor = node ? "pointer" : "default";
      }
    },
    [],
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ── Canvas: renderer de nó com efeito glow ───────────────────────────────
  const nodeCanvasObject = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };
      if (n.x === undefined || n.y === undefined) return;

      const r = Math.max(3, n.size / 2);
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const highlight = isSelected || isHovered;

      // ── Halo exterior (glow WebGL via shadowBlur) ────────────────────────
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur = highlight ? 18 : 8;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();

      ctx.restore();

      // ── Anel de seleção ──────────────────────────────────────────────────
      if (highlight) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? "#ffffff" : n.color;
        ctx.lineWidth = (isSelected ? 1.8 : 1.2) / globalScale;
        ctx.stroke();
      }

      // ── Label — renderizado condicionalmente por zoom e tipo ─────────────
      const alwaysLabel =
        n.type === "season" || n.type === "round" || n.type === "simulation";
      const showLabel = alwaysLabel || globalScale >= 0.55;

      if (showLabel) {
        const maxLen =
          n.type === "season" ? 20 : n.type === "round" ? 12 : 16;
        const text =
          n.label.length > maxLen
            ? n.label.slice(0, maxLen - 1) + "…"
            : n.label;
        const baseFontSize = n.type === "season" ? 13 : n.type === "round" ? 11 : 9;
        const fontSize = Math.max(3, Math.min(baseFontSize, baseFontSize / globalScale));

        ctx.font = `${isSelected ? "600 " : ""}${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? "#ffffff" : "#cbd5e1";
        ctx.fillText(text, n.x, n.y + r + 2 / globalScale);
      }
    },
    [selectedNode, hoveredNode],
  );

  // ── Área de hit maior que o raio visual (facilita o clique em nós pequenos)
  const nodePointerAreaPaint = useCallback(
    (node: object, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode & { x: number; y: number };
      if (n.x === undefined || n.y === undefined) return;

      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(10, n.size), 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  // ── Renderização ──────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{
        position: "fixed",
        inset: 0,
        background: "#020617",  // slate-950 — mais escuro que #0f172a
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* ── Gradiente radial de fundo (profundidade visual) ──────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(56,100,120,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Grafo WebGL ──────────────────────────────────────────────────── */}
      {!loading && data && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <ForceGraph2D
            graphData={data}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={() => ""}
            nodeColor={(n: object) => (n as GraphNode).color}
            nodeVal={(n: object) => (n as GraphNode).size}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            linkColor={(l: object) => (l as GraphLink).color}
            linkWidth={0.8}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.88}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={(l: object) =>
              (l as GraphLink).color
            }
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            cooldownTicks={150}
            d3AlphaDecay={0.018}
            d3VelocityDecay={0.28}
          />
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              color: "#475569",
              fontSize: "13px",
              fontFamily: "var(--font-plex-mono, 'IBM Plex Mono', monospace)",
              letterSpacing: "0.04em",
            }}
          >
            calibrando mapa cognitivo…
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "12px",
              padding: "1.5rem 2rem",
              color: "#fca5a5",
              fontSize: "13px",
              maxWidth: "380px",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "6px" }}>
              Sinal interrompido
            </div>
            <div style={{ color: "#f87171", fontFamily: "monospace" }}>
              {error}
            </div>
          </div>
        </div>
      )}

      {/* ── Painel de Controles (top-left) ───────────────────────────────── */}
      <div style={glassPanel({ top: "1.5rem", left: "1.5rem", width: "240px", zIndex: 110 })}>
        {/* Título */}
        <div
          style={{
            fontSize: "10px",
            color: "#334155",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: "1rem",
            fontFamily: "var(--font-plex-mono, monospace)",
          }}
        >
          BOB · Live Brain Console
        </div>

        {/* Selector Season */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <label
            style={{ color: "#64748b", fontSize: "12px", minWidth: "56px" }}
          >
            Temporada
          </label>
          <select
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10))}
            style={selectStyle}
            aria-label="Selecionar temporada"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y} style={{ background: "#0f172a" }}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Selector Rounds */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <label
            style={{ color: "#64748b", fontSize: "12px", minWidth: "56px" }}
          >
            Rodadas
          </label>
          <select
            value={roundsLimit}
            onChange={(e) => setRoundsLimit(parseInt(e.target.value, 10))}
            style={selectStyle}
            aria-label="Selecionar número de rodadas"
          >
            {[5, 10, 20, 38].map((n) => (
              <option key={n} value={n} style={{ background: "#0f172a" }}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Stats de nós */}
        {data && (
          <>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                margin: "0.875rem 0 0.75rem",
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {Object.entries(data.meta.nodeCounts).map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#475569", fontSize: "11px" }}>
                    {type}
                  </span>
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "var(--font-plex-mono, monospace)",
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                margin: "0.75rem 0 0.5rem",
              }}
            />
            <div
              style={{
                fontSize: "10px",
                color: "#1e293b",
                fontFamily: "var(--font-plex-mono, monospace)",
              }}
            >
              {new Date(data.meta.generatedAt).toLocaleTimeString("pt-BR")}
            </div>
          </>
        )}

        {/* Back button */}
        <div style={{ marginTop: "1rem" }}>
          <a
            href="/admin/cerebro"
            style={{
              display: "block",
              textAlign: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "6px 12px",
              color: "#475569",
              fontSize: "11px",
              textDecoration: "none",
              transition: "border-color 0.15s, color 0.15s",
              fontFamily: "var(--font-plex-mono, monospace)",
            }}
          >
            ← Voltar ao Cérebro
          </a>
        </div>
      </div>

      {/* ── Hover Tooltip ─────────────────────────────────────────────────── */}
      {hoveredNode && !selectedNode && (
        <HoverTooltip
          node={hoveredNode}
          x={mousePos.x}
          y={mousePos.y}
        />
      )}

      {/* ── Detail Panel (top-right) ──────────────────────────────────────── */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* ── Legend (bottom-left) ─────────────────────────────────────────── */}
      <Legend />
    </div>
  );
}
