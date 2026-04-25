"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  label: string;
  type: "core" | "input" | "memory" | "pattern" | "output";
  active: boolean;
  pulsePhase: number;
}

interface Connection {
  from: string;
  to: string;
  strength: number;
  pulsePhase: number;
  active: boolean;
}

interface NeuralBrainProps {
  rounds?: number;
  memories?: number;
  patterns?: number;
  simulations?: number;
  isThinking?: boolean;
  thinkingMode?: string;
}

export function NeuralBrain({
  rounds = 0,
  memories = 0,
  patterns = 0,
  simulations = 0,
  isThinking = false,
  thinkingMode = "DUAL_MIND",
}: NeuralBrainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const nodesRef = useRef<Node[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Initialize nodes
  const initializeNodes = useCallback(() => {
    const nodes: Node[] = [];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Core node - BOB
    nodes.push({
      id: "core",
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      radius: 35,
      label: "BOB",
      type: "core",
      active: true,
      pulsePhase: 0,
    });

    // Input nodes - APIs
    const inputs = ["Football-Data", "API-Football", "Odds API", "Claude AI", "GPT AI"];
    inputs.forEach((label, i) => {
      const angle = (i / inputs.length) * Math.PI * 2 - Math.PI / 2;
      const dist = 120;
      nodes.push({
        id: `input-${i}`,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 18,
        label,
        type: "input",
        active: Math.random() > 0.3,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    });

    // Memory nodes
    const memoryCount = Math.min(memories, 8);
    for (let i = 0; i < memoryCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 60;
      nodes.push({
        id: `memory-${i}`,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 10 + Math.random() * 8,
        label: `Memória ${i + 1}`,
        type: "memory",
        active: true,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Pattern nodes
    const patternCount = Math.min(patterns, 6);
    for (let i = 0; i < patternCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 50;
      nodes.push({
        id: `pattern-${i}`,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: 12,
        label: `Padrão ${i + 1}`,
        type: "pattern",
        active: true,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Output nodes - Decisions
    const outputs = ["Âncoras", "Variações", "Big Odds", "Análise"];
    outputs.forEach((label, i) => {
      const angle = (i / outputs.length) * Math.PI * 2 + Math.PI / 4;
      const dist = 180;
      nodes.push({
        id: `output-${i}`,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 20,
        label,
        type: "output",
        active: rounds > 0,
        pulsePhase: 0,
      });
    });

    nodesRef.current = nodes;

    // Create connections
    const connections: Connection[] = [];
    const coreNode = nodes.find((n) => n.id === "core")!;

    // Connect inputs to core
    nodes.filter((n) => n.type === "input").forEach((input) => {
      connections.push({
        from: input.id,
        to: coreNode.id,
        strength: input.active ? 0.8 + Math.random() * 0.2 : 0.2,
        pulsePhase: Math.random() * Math.PI * 2,
        active: input.active,
      });
    });

    // Connect core to memories
    nodes.filter((n) => n.type === "memory").forEach((mem) => {
      connections.push({
        from: coreNode.id,
        to: mem.id,
        strength: 0.7,
        pulsePhase: Math.random() * Math.PI * 2,
        active: true,
      });
    });

    // Connect memories to patterns
    nodes.filter((n) => n.type === "memory").forEach((mem) => {
      nodes.filter((n) => n.type === "pattern").forEach((pat) => {
        if (Math.random() > 0.5) {
          connections.push({
            from: mem.id,
            to: pat.id,
            strength: 0.5,
            pulsePhase: Math.random() * Math.PI * 2,
            active: true,
          });
        }
      });
    });

    // Connect patterns and core to outputs
    nodes.filter((n) => n.type === "pattern").forEach((pat) => {
      nodes.filter((n) => n.type === "output").forEach((out) => {
        connections.push({
          from: pat.id,
          to: out.id,
          strength: 0.6,
          pulsePhase: Math.random() * Math.PI * 2,
          active: pat.active,
        });
      });
    });

    connectionsRef.current = connections;
  }, [rounds, memories, patterns, simulations]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initializeNodes();
    };

    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const animate = (time: number) => {
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const nodes = nodesRef.current;
      const connections = connectionsRef.current;
      const coreNode = nodes.find((n) => n.id === "core");

      // Update nodes
      nodes.forEach((node) => {
        if (node.type === "memory" || node.type === "pattern") {
          // Gentle floating
          node.x += node.vx;
          node.y += node.vy;

          // Boundary constraints
          const margin = 50;
          if (node.x < margin || node.x > rect.width - margin) node.vx *= -1;
          if (node.y < margin || node.y > rect.height - margin) node.vy *= -1;

          // Attraction to center
          if (coreNode) {
            const dx = coreNode.x - node.x;
            const dy = coreNode.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 200) {
              node.vx += (dx / dist) * 0.01;
              node.vy += (dy / dist) * 0.01;
            }
          }

          // Damping
          node.vx *= 0.98;
          node.vy *= 0.98;
        }

        // Update pulse phase
        node.pulsePhase += deltaTime * (isThinking ? 3 : 1);
      });

      // Draw connections
      connections.forEach((conn) => {
        const fromNode = nodes.find((n) => n.id === conn.from);
        const toNode = nodes.find((n) => n.id === conn.to);
        if (!fromNode || !toNode) return;

        const pulseSpeed = isThinking ? 4 : 1.5;
        conn.pulsePhase += deltaTime * pulseSpeed;

        const gradient = ctx.createLinearGradient(fromNode.x, fromNode.y, toNode.x, toNode.y);
        
        if (conn.active) {
          const alpha = 0.3 + Math.sin(conn.pulsePhase) * 0.2;
          gradient.addColorStop(0, `rgba(46, 139, 99, ${alpha})`);
          gradient.addColorStop(0.5, `rgba(100, 200, 150, ${alpha + 0.3})`);
          gradient.addColorStop(1, `rgba(46, 139, 99, ${alpha})`);
        } else {
          gradient.addColorStop(0, "rgba(100, 100, 100, 0.1)");
          gradient.addColorStop(1, "rgba(100, 100, 100, 0.1)");
        }

        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = conn.active ? 2 : 1;
        ctx.stroke();

        // Animated pulse along connection
        if (conn.active) {
          const pulsePos = (Math.sin(conn.pulsePhase) + 1) / 2;
          const pulseX = fromNode.x + (toNode.x - fromNode.x) * pulsePos;
          const pulseY = fromNode.y + (toNode.y - fromNode.y) * pulsePos;

          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 3, 0, Math.PI * 2);
          ctx.fillStyle = isThinking ? "#64c896" : "#2e8b63";
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach((node) => {
        const pulseScale = 1 + Math.sin(node.pulsePhase) * 0.1;
        
        // Glow effect for active nodes
        if (node.active) {
          const gradient = ctx.createRadialGradient(
            node.x, node.y, 0,
            node.x, node.y, node.radius * 2 * pulseScale
          );
          
          if (node.type === "core") {
            gradient.addColorStop(0, "rgba(46, 139, 99, 0.6)");
            gradient.addColorStop(0.5, "rgba(46, 139, 99, 0.2)");
            gradient.addColorStop(1, "rgba(46, 139, 99, 0)");
          } else if (node.type === "input") {
            gradient.addColorStop(0, node.active ? "rgba(100, 200, 150, 0.4)" : "rgba(150, 150, 150, 0.2)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          } else {
            gradient.addColorStop(0, "rgba(100, 180, 140, 0.3)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 2 * pulseScale, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // Node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
        
        if (node.type === "core") {
          const gradient = ctx.createRadialGradient(
            node.x - 5, node.y - 5, 0,
            node.x, node.y, node.radius
          );
          gradient.addColorStop(0, "#3db380");
          gradient.addColorStop(1, "#1d5c41");
          ctx.fillStyle = gradient;
        } else if (node.type === "input") {
          ctx.fillStyle = node.active ? "#2e8b63" : "#444";
        } else if (node.type === "memory") {
          ctx.fillStyle = "#4a9";
        } else if (node.type === "pattern") {
          ctx.fillStyle = "#6b8";
        } else {
          ctx.fillStyle = "#2e8b63";
        }
        
        ctx.fill();
        ctx.strokeStyle = node.active ? "#64c896" : "#666";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.font = node.type === "core" ? "bold 14px system-ui" : "11px system-ui";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        if (node.type === "core") {
          ctx.fillText("BOB", node.x, node.y - 5);
          ctx.font = "10px system-ui";
          ctx.fillStyle = "#64c896";
          ctx.fillText(thinkingMode, node.x, node.y + 8);
        } else {
          // Only show label on hover or for important nodes
          const isHovered = hoveredNode?.id === node.id;
          if (isHovered || node.type === "output" || node.type === "input") {
            ctx.fillText(node.label, node.x, node.y + node.radius + 12);
          }
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initializeNodes, isThinking, thinkingMode, hoveredNode]);

  // Handle mouse interactions
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width / window.devicePixelRatio);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height / window.devicePixelRatio);
    setMousePos({ x, y });

    // Find hovered node
    const hovered = nodesRef.current.find((node) => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < node.radius + 5;
    });
    setHoveredNode(hovered || null);
  };

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        className="w-full h-full cursor-crosshair rounded-xl"
        style={{ background: "radial-gradient(circle at center, rgba(29, 92, 65, 0.1) 0%, transparent 70%)" }}
      />
      
      {hoveredNode && (
        <div 
          className="absolute pointer-events-none bg-surface-strong border border-border rounded-lg px-3 py-2 shadow-lg z-10"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y - 10,
          }}
        >
          <p className="text-xs font-semibold text-accent">{hoveredNode.label}</p>
          <p className="text-[10px] text-muted capitalize">{hoveredNode.type}</p>
          <p className="text-[10px] text-muted">{hoveredNode.active ? "Ativo" : "Inativo"}</p>
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute bottom-4 left-4 flex gap-3">
        <div className="bg-surface/90 backdrop-blur rounded-lg px-3 py-2 border border-border">
          <p className="text-[10px] text-muted uppercase">Rodadas</p>
          <p className="text-lg font-bold text-accent">{rounds}</p>
        </div>
        <div className="bg-surface/90 backdrop-blur rounded-lg px-3 py-2 border border-border">
          <p className="text-[10px] text-muted uppercase">Memórias</p>
          <p className="text-lg font-bold text-accent">{memories}</p>
        </div>
        <div className="bg-surface/90 backdrop-blur rounded-lg px-3 py-2 border border-border">
          <p className="text-[10px] text-muted uppercase">Padrões</p>
          <p className="text-lg font-bold text-accent">{patterns}</p>
        </div>
      </div>

      {isThinking && (
        <div className="absolute top-4 right-4 bg-accent/20 backdrop-blur rounded-full px-4 py-2 border border-accent/40">
          <span className="flex items-center gap-2 text-sm font-medium text-accent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            BOB está pensando...
          </span>
        </div>
      )}
    </div>
  );
}
