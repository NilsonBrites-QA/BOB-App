"use client";

import { type CSSProperties, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  createdAt: Date;
};

type HistorySource = "server" | "offline" | "empty" | "error";

const STARTERS = [
  "Quem lidera o Brasileirão?",
  "Quais são os âncoras da rodada?",
  "Explica a diferença entre V1 e V5",
  "Como funciona o score do BOB?",
];

const STORAGE_KEY = "bob-chat-offline";
const MAX_STORED = 20;

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function absoluteTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadOfflineMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Message, "createdAt"> & { createdAt: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_STORED).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
    }));
  } catch {
    return [];
  }
}

function saveOfflineMessages(messages: Message[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // localStorage indisponível.
  }
}

function historyStatusMeta(source: HistorySource) {
  if (source === "server") {
    return {
      badge: "Histórico online",
      tone: "border-accent/20 bg-accent/10 text-accent-strong",
      description: "Conversa sincronizada com o histórico autenticado.",
    };
  }
  if (source === "offline") {
    return {
      badge: "Histórico local",
      tone: "border-signal/25 bg-signal/10 text-signal",
      description: "O chat abriu com o último histórico salvo neste navegador.",
    };
  }
  if (source === "error") {
    return {
      badge: "Consulta instável",
      tone: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
      description: "A sincronização do consultor falhou neste momento.",
    };
  }
  return {
    badge: "Pronto para conversar",
    tone: "border-border bg-background/60 text-muted",
    description: "Abra uma leitura nova ou use um atalho rápido abaixo.",
  };
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historySource, setHistorySource] = useState<HistorySource>("empty");
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    if (!open || historyLoaded) return;

    setHistLoading(true);
    setError(null);

    fetch("/api/bob/chat/history")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{
          messages: Array<{
            id: string;
            role: string;
            content: string;
            model?: string;
            createdAt: string;
          }>;
        }>;
      })
      .then(({ messages: history }) => {
        const loaded: Message[] = history.map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.content,
          model: message.model,
          createdAt: new Date(message.createdAt),
        }));

        setMessages(loaded);
        setHistorySource(loaded.length > 0 ? "server" : "empty");
        setLastModel(loaded.filter((message) => message.role === "assistant").at(-1)?.model ?? null);
      })
      .catch(() => {
        const offline = loadOfflineMessages();
        if (offline.length > 0) {
          setMessages(offline);
          setHistorySource("offline");
          setLastModel(offline.filter((message) => message.role === "assistant").at(-1)?.model ?? null);
          return;
        }

        setHistorySource("error");
        setError("Não foi possível carregar o histórico do consultor agora.");
      })
      .finally(() => {
        setHistLoading(false);
        setHistoryLoaded(true);
      });
  }, [historyLoaded, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  function clearConversation() {
    setMessages([]);
    setError(null);
    setLastModel(null);
    setHistorySource("empty");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage indisponível.
    }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: `local-${++idCounter.current}`,
      role: "user",
      content: text.trim(),
      createdAt: new Date(),
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bob/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { reply: string; model: string };
      const assistantMsg: Message = {
        id: `local-${++idCounter.current}`,
        role: "assistant",
        content: data.reply,
        model: data.model,
        createdAt: new Date(),
      };

      const updated = [...history, assistantMsg];
      setMessages(updated);
      setLastModel(data.model);
      saveOfflineMessages(updated);
      setHistorySource("server");
    } catch (err) {
      const message = err instanceof Error ? err.message : "O consultor ficou indisponível.";
      setError(message);
      saveOfflineMessages(history);
      if (historySource === "server" || historySource === "empty") {
        setHistorySource("offline");
      }
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const status = historyStatusMeta(historySource);

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_18px_40px_rgba(17,94,67,0.28)] transition-transform hover:scale-105 active:scale-95"
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

      {open && (
        <div className="fixed bottom-4 left-4 right-4 z-50 flex h-[72vh] flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:bottom-24 sm:left-auto sm:right-6 sm:h-[620px] sm:w-[430px] sm:max-w-[calc(100vw-3rem)]">
          <div className="border-b border-border bg-surface-strong px-4 py-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow-[0_10px_24px_rgba(17,94,67,0.2)]">
                    B
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">BOB Consultor</p>
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                          status.tone,
                        ].join(" ")}
                      >
                        {status.badge}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {lastModel ? `Modelo recente: ${lastModel}` : "Big Odds Brasileirão · leitura consultiva"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-border/80 bg-background/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Estado</p>
                    <p className="mt-1 text-sm font-semibold">{loading ? "Respondendo" : status.badge}</p>
                  </div>
                  <div className="rounded-[18px] border border-border/80 bg-background/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Mensagens</p>
                    <p className="mt-1 text-sm font-semibold">{messages.length}</p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-background hover:text-foreground"
                    title="Limpar conversa"
                    aria-label="Limpar conversa"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 4H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M5.2 4V3.3C5.2 2.75 5.65 2.3 6.2 2.3H7.8C8.35 2.3 8.8 2.75 8.8 3.3V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M4.2 5.3L4.55 10.55C4.59 11.12 5.07 11.56 5.64 11.56H8.36C8.93 11.56 9.41 11.12 9.45 10.55L9.8 5.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M6 6.4V9.3M8 6.4V9.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-background hover:text-foreground"
                  aria-label="Fechar chat"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {(historySource === "offline" || historySource === "error") && (
            <div
              className={[
                "border-b px-4 py-2 text-[11px]",
                historySource === "error"
                  ? "border-red-500/20 bg-red-500/8 text-red-600 dark:text-red-300"
                  : "border-signal/20 bg-signal/8 text-signal",
              ].join(" ")}
            >
              {status.description}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {histLoading && (
              <p className="py-8 text-center text-[11px] text-muted">Carregando histórico do consultor...</p>
            )}

            {!histLoading && messages.length === 0 && (
              <div className="space-y-4">
                <div className="panel rounded-[24px] p-4">
                  <p className="kicker text-[11px] text-muted">Leitura instantânea</p>
                  <h3 className="mt-2 text-lg font-semibold">Pergunte como se estivesse montando o bilhete agora</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    O consultor responde sobre rodada, classificação, cenários e leitura dos confrontos. Use um atalho abaixo ou escreva sua própria pergunta.
                  </p>
                </div>

                <div className="grid gap-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      onClick={() => void send(starter)}
                      className="rounded-[18px] border border-border bg-surface-strong px-3 py-3 text-left text-xs text-muted transition hover:border-accent/30 hover:bg-accent/5 hover:text-foreground"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!histLoading && messages.length > 0 && (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user" ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1"}
                  >
                    <div className={message.role === "user" ? "flex justify-end" : "flex items-start gap-2"}>
                      {message.role === "assistant" && (
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                          B
                        </div>
                      )}
                      <div
                        className={[
                          "max-w-[82%] rounded-[18px] px-3 py-2.5 text-xs leading-relaxed",
                          message.role === "user"
                            ? "rounded-br-sm bg-accent text-white"
                            : "rounded-bl-sm border border-border bg-surface-strong text-foreground",
                        ].join(" ")}
                      >
                        {message.role === "assistant" ? (
                          <div className="prose prose-xs max-w-none dark:prose-invert prose-p:my-0.5 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-li:my-0 prose-ul:my-1 prose-ol:my-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          message.content
                        )}
                      </div>
                    </div>

                    <span
                      className={[
                        "text-[10px] text-muted",
                        message.role === "user" ? "pr-1" : "pl-8",
                      ].join(" ")}
                      title={absoluteTime(message.createdAt)}
                    >
                      {relativeTime(message.createdAt)}
                    </span>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                      B
                    </div>
                    <div className="rounded-[18px] rounded-bl-sm border border-border bg-surface-strong px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-[18px] border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-border bg-surface-strong px-3 py-3">
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunte ao BOB sobre a rodada, odds, âncoras ou cenários..."
                  rows={1}
                  disabled={loading}
                  className="min-h-[42px] flex-1 resize-none rounded-[18px] border border-border bg-background px-3 py-2 text-xs leading-5 text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:opacity-50"
                  style={{ maxHeight: "96px", overflowY: "auto", fieldSizing: "content" } as CSSProperties}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8L14 8M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 text-[10px] text-muted">
                <span>Enter envia · Shift + Enter quebra linha</span>
                <span>{loading ? "Consultor analisando..." : status.description}</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
