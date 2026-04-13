"use client";

/**
 * BOB — /chat
 *
 * Interface conversacional com o BOB.
 *
 * Tela de formulário/conversa. Objetivo: usuário faz perguntas analíticas
 * sobre o Brasileirão, método BOB e apostas. NOT: um chatbot genérico.
 *
 * Design: terminal analítico denso — não chat bonitinho.
 * Hierarquia: área de conversa domina; input no rodapé fixo.
 */

import { useState, useRef, useEffect, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id:      number;
  role:    "user" | "assistant";
  content: string;
  model?:  string;
};

const STARTERS = [
  "Como o algoritmo escolhe uma âncora?",
  "Explica a lógica do Value Edge",
  "Qual a diferença real entre V1 e V5?",
  "Por que o BOB não garante resultados?",
];

export default function ChatPage() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input,    setInput]        = useState("");
  const [loading,  setLoading]      = useState(false);
  const [error,    setError]        = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const idRef     = useRef(0);

  // Auto-scroll ao receber mensagem nova
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({
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
      // Refocar no input após resposta
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
    <div className="flex flex-1 flex-col" style={{ height: "calc(100dvh - 64px)" }}>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">

        {/* Estado vazio */}
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-2xl flex-col gap-8 pt-10">
            <div>
              <p className="kicker text-xs text-muted">BOB · V2026</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight">
                Faz a pergunta.<br />O BOB responde com dados.
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
                Conversa analítica sobre o Brasileirão, o método BOB e o
                funcionamento do algoritmo. Sem tempo real — com raciocínio.
              </p>
            </div>

            {/* Sugestões de início */}
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-2xl border border-border bg-surface-strong px-4 py-3 text-left text-sm text-muted transition-colors hover:bg-accent-soft hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Histórico de mensagens */}
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              {m.role === "assistant" && (
                <div className="mr-3 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                  B
                </div>
              )}
              <div
                className={[
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7",
                  m.role === "user"
                    ? "rounded-br-sm bg-accent text-white"
                    : "rounded-bl-sm border border-border bg-surface-strong text-foreground",
                ].join(" ")}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0.5 prose-headings:font-semibold prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
                {m.role === "assistant" && m.model && m.model !== "offline" && (
                  <p className="mt-1 font-mono text-[10px] text-muted/50">{m.model}</p>
                )}
              </div>
            </div>
          ))}

          {/* Indicador de digitação */}
          {loading && (
            <div className="flex justify-start">
              <div className="mr-3 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                B
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-border bg-surface-strong px-5 py-4">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input fixo no rodapé */}
      <div className="border-t border-border bg-surface px-4 py-4 sm:px-6 lg:px-10">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-end gap-3"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte ao BOB… (Enter para enviar)"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-2xl border border-border bg-surface-strong px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:opacity-50"
            style={{ maxHeight: "120px", overflowY: "auto", fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label="Enviar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8L14 8M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[10px] text-muted/40">
          BOB não garante resultados. Aposte com responsabilidade.
        </p>
      </div>
    </div>
  );
}
