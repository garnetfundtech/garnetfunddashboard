"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "model"; text: string };

const CHARS_PER_TICK = 5;
const TICK_MS = 12;

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  // Tracks which message index is currently being typed out and how far along
  const [animState, setAnimState] = useState<{ msgIndex: number; typedLen: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Typewriter: advance typedLen toward the full length of the animating message
  useEffect(() => {
    if (!animState) return;
    const target = messages[animState.msgIndex]?.text ?? "";
    if (animState.typedLen >= target.length) return;
    // Catch up faster once streaming is done so it doesn't lag at the end
    const step = loading ? CHARS_PER_TICK : CHARS_PER_TICK * 3;
    const id = setTimeout(() => {
      setAnimState((prev) => {
        if (!prev) return null;
        const newLen = Math.min(prev.typedLen + step, target.length);
        return { ...prev, typedLen: newLen };
      });
      scrollEnd();
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [animState, messages, loading, scrollEnd]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    scrollEnd();

    try {
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const json = (await res.json()) as { message?: string };
        const errIdx = next.length;
        setMessages([...next, { role: "model", text: json.message ?? "Something went wrong." }]);
        setAnimState({ msgIndex: errIdx, typedLen: 0 });
        return;
      }

      // Seed an empty model message and start the typewriter at that index
      const modelMsgIdx = next.length;
      setMessages([...next, { role: "model", text: "" }]);
      setAnimState({ msgIndex: modelMsgIdx, typedLen: 0 });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snap = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "model", text: snap };
          return updated;
        });
      }
    } catch {
      const errIdx = messages.length + 1;
      setMessages((prev) => [...prev, { role: "model", text: "Network error. Try again." }]);
      setAnimState({ msgIndex: errIdx, typedLen: 0 });
    } finally {
      setLoading(false);
      scrollEnd();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-[100] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition",
          "bg-[#8e0604] text-white hover:bg-[#a80705]",
          open && "opacity-0 pointer-events-none",
        )}
        aria-label="Open portfolio chat"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed bottom-5 right-5 z-[100] flex h-[min(560px,80vh)] w-[min(400px,92vw)] flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#08090a] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-white">Ask AI</p>
              <p className="caps-label">Powered by Portfolio Knowledge</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[8px] p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
            {messages.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Ask about holdings, sector exposure, recent trades, risk, or any research and resources on file.
              </p>
            ) : null}
            {messages.map((m, i) => {
              const isAnimating = animState?.msgIndex === i;
              const isTypingDone = !isAnimating || (animState?.typedLen ?? 0) >= m.text.length;
              const displayText = isAnimating ? m.text.slice(0, animState?.typedLen ?? 0) : m.text;
              return (
                <div
                  key={`${i}-${m.role}`}
                  className={cn(
                    "max-w-[95%] rounded-[10px] px-2.5 py-2 text-xs leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-[#8e0604]/25 text-zinc-100"
                      : "mr-auto bg-white/[0.05] text-zinc-200",
                  )}
                >
                  {m.role === "model" ? (
                    <span>
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                          ul: ({ children }) => <ul className="ml-3 list-disc space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="ml-3 list-decimal space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          h1: ({ children }) => <p className="mb-0.5 font-semibold text-white">{children}</p>,
                          h2: ({ children }) => <p className="mb-0.5 font-semibold text-white">{children}</p>,
                          h3: ({ children }) => <p className="mb-0.5 font-semibold text-white">{children}</p>,
                          a: ({ href, children }) => {
                            if (!href) return <>{children}</>;
                            const isInternal = href.startsWith("/");
                            if (isInternal) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpen(false);
                                    router.push(href);
                                  }}
                                  className="text-[#c94040] underline underline-offset-2 hover:text-[#e05050]"
                                >
                                  {children}
                                </button>
                              );
                            }
                            return (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#c94040] underline underline-offset-2 hover:text-[#e05050]"
                              >
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {displayText}
                      </ReactMarkdown>
                      {isAnimating && !isTypingDone && (
                        <span className="ml-px inline-block h-3 w-px animate-pulse bg-zinc-400 align-middle" />
                      )}
                    </span>
                  ) : (
                    m.text
                  )}
                </div>
              );
            })}
            {loading && messages[messages.length - 1]?.role !== "model" ? (
              <p className="text-[11px] text-zinc-500 animate-pulse">Thinking…</p>
            ) : null}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2 border-t border-white/[0.06] p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
              placeholder="Ask about the fund…"
              className="glass-input min-w-0 flex-1 rounded-[10px] px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void send()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#8e0604] text-white hover:bg-[#a80705] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
