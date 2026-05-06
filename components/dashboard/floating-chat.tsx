"use client";

import { useCallback, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "model"; text: string };

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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
      const json = (await res.json()) as { ok?: boolean; text?: string; message?: string };
      if (!res.ok || !json.ok) {
        setMessages([...next, { role: "model", text: json.message ?? "Something went wrong." }]);
      } else {
        setMessages([...next, { role: "model", text: json.text ?? "" }]);
      }
    } catch {
      setMessages([...next, { role: "model", text: "Network error. Try again." }]);
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
        <MessageSquare className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed bottom-5 right-5 z-[100] flex h-[min(520px,80vh)] w-[min(400px,92vw)] flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#08090a] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <div>
              <p className="caps-label">AI</p>
              <p className="text-sm font-semibold text-white">Portfolio Q&amp;A</p>
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
                Ask about concentration, sector exposure, recent activity, or risk — answers use live Schwab
                portfolio context.
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={cn(
                  "max-w-[95%] rounded-[10px] px-2.5 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-[#8e0604]/25 text-zinc-100"
                    : "mr-auto bg-white/[0.05] text-zinc-200",
                )}
              >
                {m.text}
              </div>
            ))}
            {loading ? <p className="text-[11px] text-zinc-500 animate-pulse">Thinking…</p> : null}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2 border-t border-white/[0.06] p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
              placeholder="Ask about the book…"
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
