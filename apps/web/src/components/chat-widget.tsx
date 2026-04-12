"use client";

/**
 * BOB — Chat Widget Flutuante
 *
 * Botão fixo no canto inferior direito que expande uma janela de chat.
 * Disponível em todas as páginas (inserido no layout root).
 * Reutiliza o endpoint /api/bob/chat que já tem acesso ao cérebro.
 *
 * Features:
 *  - Markdown renderizado nas respostas do BOB (react-markdown + remark-gfm)
 *  - Persistência no localStorage (últimas 50 mensagens)
 *  - Botão "Limpar conversa" no header
 */

import { useState, useRef, useEffect, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Message = {
  id:      number;
  role:    "user" | "assistant";
  content: string;
  model?:  string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const STARTERS = [
  "Quem lidera o Brasileirão?",
  "Quais são os âncoras da rodada?",
  "Explica a diferença entre V1 e V5",
  "Como funciona o score do BOB?",
];

const STORAGE_KEY = "bob-chat-messages";
const MAX_STORED   = 50;

// ─── Helpers de localStorage ──────────────────────────────────────────────────

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Message[]).slice(-MAX_STORED);
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(msgs.slice(-MAX_STORED)),
    );
  } catch {
    // Storage indisponível — continua sem persistência
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ChatWidget() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const idRef     = useRef(0);

  // Restaurar histórico do localStorage na montagem
  useEffect(() => {
    const stored = loadMessages();
    if (stored.length > 0) {
      idRef.current = Math.max(...stored.map((m) => m.id), 0);
      setMessages(stored);
    }
  }, []);

  // Persistir sempre que as mensagens mudarem
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function clearConversation() {
    setMessages([]);
    idRef.current = 0;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    const userMsg: Message = { id: ++idRef.current, role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/bob/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { reply: string; model: string };
      setMessages((prev) => [
        ...prev,
        { id: ++idRef.current, role: "assistant", content: data.reply, model: data.model },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
        aria-label={open ? "Fechar chat" : "Abrir chat BOB"}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Janela do chat */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:w-[420px]">

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-surface-strong px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
              B
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">BOB</p>
              <p className="text-[11px] text-muted">Big Odds Brasileirão · ao vivo</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="rounded-md px-2 py-1 text-[11px] text-muted hover:bg-surface hover:text-foreground"
                title="Limpar conversa"
              >
                Limpar
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-center text-xs text-muted">
                  Pergunte sobre a rodada, classificação ou as variações.
                </p>
                <div className="grid gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="rounded-xl border border-border bg-surface-strong px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-[var(--accent-soft)] hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  {m.role === "assistant" && (
                    <div className="mr-2 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                      B
                    </div>
                  )}
                  <div
                    className={[
                      "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-[var(--accent)] text-white"
                        : "rounded-bl-sm border border-border bg-surface-strong text-foreground",
                    ].join(" ")}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-xs max-w-none dark:prose-invert prose-p:my-0.5 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-li:my-0 prose-ul:my-1 prose-ol:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="mr-2 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                    B
                  </div>
                  <div className="rounded-xl rounded-bl-sm border border-border bg-surface-strong px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border bg-surface-strong px-3 py-2.5">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte ao BOB…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-5 text-foreground placeholder:text-muted/50 focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                style={{ maxHeight: "80px", overflowY: "auto", fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                aria-label="Enviar"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8L14 8M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>

        </div>
      )}
    </>
  );
}

