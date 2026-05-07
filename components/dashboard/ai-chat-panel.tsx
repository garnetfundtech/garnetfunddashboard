"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context — shared between AiChatTrigger (in header rows) and AiChatPanel (in layout)
// ---------------------------------------------------------------------------

type AiChatCtx = { open: boolean; setOpen: (v: boolean) => void };
const AiChatContext = createContext<AiChatCtx>({ open: false, setOpen: () => {} });

export function AiChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AiChatContext.Provider value={{ open, setOpen }}>
      {children}
    </AiChatContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Trigger button — inline, placed in each page's header row
// ---------------------------------------------------------------------------

export function AiChatTrigger() {
  const { open, setOpen } = useContext(AiChatContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "glass-input flex h-[42px] w-[42px] shrink-0 items-center justify-center text-zinc-300 transition-colors hover:bg-white/10",
        open && "bg-white/[0.08] text-white",
      )}
      aria-label="Toggle AI assistant"
    >
      <Sparkles className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel — fixed full-height, rendered in layout, only shows when open
// ---------------------------------------------------------------------------

type Msg = { role: "user" | "model"; text: string };

const CHARS_PER_TICK = 5;
const TICK_MS = 12;

const EXCLUDED_PATHS = ["/users", "/admin"];

const PAGE_LABELS: Record<string, string> = {
  "/home": "Portfolio Overview",
  "/research": "Research",
  "/resources": "Resources",
  "/watchlist": "Watchlist",
  "/earnings": "Earnings Calendar",
  "/pipeline": "Investment Pipeline",
  "/orders": "Trade History",
};

const PAGE_HINTS: Record<string, string> = {
  "/home": "Ask about holdings, P&L, sector exposure, or cash balance…",
  "/research": "Ask about research documents, analysts, or thesis status…",
  "/resources": "Ask about available resource files or categories…",
  "/watchlist": "Ask about tracked tickers, price targets, or notes…",
  "/earnings": "Ask about upcoming earnings dates or EPS estimates…",
  "/pipeline": "Ask about pitches, stages, or analyst thesis statements…",
  "/orders": "Ask about recent trades, order details, or execution history…",
};

export function AiChatPanel() {
  const { open, setOpen } = useContext(AiChatContext);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [animState, setAnimState] = useState<{ msgIndex: number; typedLen: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const isExcluded = EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const pageLabel = PAGE_LABELS[pathname] ?? "Dashboard";
  const hint = PAGE_HINTS[pathname] ?? "Ask about the fund…";

  // Close and reset when navigating to an excluded page
  useEffect(() => {
    if (isExcluded) setOpen(false);
  }, [isExcluded, setOpen]);

  // Reset conversation when page changes
  useEffect(() => {
    setMessages([]);
    setAnimState(null);
    setInput("");
  }, [pathname]);

  const scrollEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (!animState) return;
    const target = messages[animState.msgIndex]?.text ?? "";
    if (animState.typedLen >= target.length) return;
    const step = loading ? CHARS_PER_TICK : CHARS_PER_TICK * 3;
    const id = setTimeout(() => {
      setAnimState((prev) => {
        if (!prev) return null;
        return { ...prev, typedLen: Math.min(prev.typedLen + step, target.length) };
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
        body: JSON.stringify({ messages: next, page: pathname }),
      });

      if (!res.ok || !res.body) {
        const json = (await res.json()) as { message?: string };
        setMessages([...next, { role: "model", text: json.message ?? "Something went wrong." }]);
        setAnimState({ msgIndex: next.length, typedLen: 0 });
        return;
      }

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
      setMessages((prev) => [...prev, { role: "model", text: "Network error. Try again." }]);
      setAnimState({ msgIndex: messages.length + 1, typedLen: 0 });
    } finally {
      setLoading(false);
      scrollEnd();
    }
  }

  if (!open || isExcluded) return null;

  return (
    <div
      className={cn(
        "fixed top-3 right-3 bottom-3 z-[100] flex w-[360px] flex-col overflow-hidden rounded-[12px] border border-white/[0.08] shadow-2xl",
        // Match the Research PDF side rail “dark glass” feel (that rail sits over a dimmed backdrop).
        // We add explicit backdrop blur + a darker translucent fill here so the AI pop-up matches.
        "backdrop-blur-md bg-black/85",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#8e0604]" />
          <div>
            <p className="text-sm font-semibold text-white">Ask AI</p>
            <p className="caps-label">{pageLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[8px] p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-500">{hint}</p>
        )}
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
        {loading && messages[messages.length - 1]?.role !== "model" && (
          <p className="text-[11px] text-zinc-500 animate-pulse">Thinking…</p>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex shrink-0 gap-2 border-t border-white/[0.06] p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
          placeholder={hint}
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
  );
}
