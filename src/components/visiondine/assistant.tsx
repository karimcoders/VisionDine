/* AI Restaurant Assistant — grounded on live DB facts, degrades gracefully */
"use client";
import { useRef, useState } from "react";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo, SectionLabel } from "@/components/visiondine/ui-bits";
import { toast } from "@/hooks/use-toast";
import { Send, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "ai"; text: string; degraded?: boolean };

const SUGGESTIONS = [
  "Aaj kitni sale hui?",
  "Which dishes sold the most this week?",
  "Which ingredients may run out soon?",
  "Any kitchen orders delayed 20+ minutes?",
  "Payment split aaj ka batao",
];

export default function AssistantView() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text: "Namaste! Main aapke restaurant ka assistant hoon. Main sirf aapke real records se baat karta hoon — sales, orders, stock, kitchen delays. Pucho kuch bhi: Hinglish ya English, dono chalega.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
    try {
      const res = await post<{ answer: string; degraded?: boolean }>("/api/assistant", { question });
      setMessages((m) => [...m, { role: "ai", text: res.answer, degraded: res.degraded }]);
    } catch (e) {
      toast({ title: "Assistant unavailable", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setMessages((m) => [...m, { role: "ai", text: "Sorry — I couldn't reach the AI service just now. The POS keeps working without me; try again in a bit." }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 60);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-4 md:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#0a5a54] text-primary-foreground shadow-soft">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <div className="font-display text-[17px] font-bold tracking-tight">Restaurant Assistant</div>
          <div className="text-[12px] text-muted-foreground">Answers come from your live records · estimates are always labelled</div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-card p-4 shadow-soft">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed", m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary")}>
              {m.text}
              {m.degraded && (
                <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <TriangleAlert className="h-3 w-3" /> AI service down — figures served directly from your database
                </span>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
              </span>
              Checking your records…
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about sales, stock, delays…" className="h-12 flex-1 rounded-2xl" disabled={busy} />
        <Button type="submit" size="icon" className="h-12 w-12 rounded-2xl" disabled={busy || !input.trim()}>
          <Send className="h-4.5 w-4.5" />
        </Button>
      </form>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        <Logo size={14} withWord={false} /> VisionDine AI · grounded answers only — if data nahi hai, clearly bolta hai
      </p>
    </div>
  );
}
