/* VisionDine login — split brand panel + staff PIN pad */
"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useVision, type Auth } from "@/lib/store";
import { Logo, RoleBadge } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const HINTS: { role: string; pin: string; name: string }[] = [
  { role: "OWNER", pin: "1001", name: "Aarav" },
  { role: "MANAGER", pin: "2002", name: "Meera" },
  { role: "CASHIER", pin: "3003", name: "Rohit" },
  { role: "WAITER", pin: "4004", name: "Priya" },
  { role: "KITCHEN", pin: "5006", name: "Chef" },
  { role: "INVENTORY", pin: "6007", name: "Sunita" },
];

export default function LoginView() {
  const setAuth = useVision((s) => s.setAuth);
  const setView = useVision((s) => s.setView);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(p: string) {
    setBusy(true);
    try {
      const { auth } = await api<{ auth: Auth }>("/api/auth", { method: "POST", body: JSON.stringify({ pin: p }) });
      setAuth(auth);
      // Role-aware landing screen
      const landing = auth.role === "KITCHEN" ? "kitchen" : ["CASHIER", "WAITER"].includes(auth.role) ? "pos" : "dashboard";
      setView(landing as "dashboard");
      toast({ title: `Welcome back, ${auth.name.split(" ")[0]}`, description: "Have a great shift." });
    } catch (e) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      toast({ title: "Could not sign in", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4 && !busy) setTimeout(() => submit(next), 120);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0d1512] p-10 text-white lg:flex">
        <div className="absolute inset-0 texture-dots opacity-[0.14]" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#0f766e]/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[#a16207]/15 blur-3xl" />
        <div className="relative"><Logo size={40} dark /></div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-extrabold leading-[1.12] tracking-tight">
            Service that moves<br />at the speed of <span className="text-[#2dd4bf]">hunger.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">
            Billing, kitchen, QR ordering and inventory — one calm system running your restaurant floor.
          </p>
          <div className="mt-8 flex items-center gap-6 text-[13px] text-white/55">
            <div><span className="tnum font-display text-xl font-bold text-white">1.4s</span><br />avg. bill time</div>
            <div className="h-8 w-px bg-white/15" />
            <div><span className="tnum font-display text-xl font-bold text-white">14</span><br />tables live</div>
            <div className="h-8 w-px bg-white/15" />
            <div><span className="tnum font-display text-xl font-bold text-white">4</span><br />kitchen stations</div>
          </div>
        </div>
        <div className="relative text-xs text-white/40">VisionDine Hospitality Pvt. Ltd. · Bandra West, Mumbai</div>
      </div>

      {/* PIN pad */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 lg:hidden"><Logo size={36} /></div>
          <div className="section-label">Shift access</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Enter your PIN</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Every action on the floor is tied to your name.</p>

          {/* PIN dots */}
          <div className={cn("mt-6 flex justify-center gap-3", shake && "animate-[shake_0.4s_ease-in-out]")}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-3.5 w-3.5 rounded-full border-2 transition-all duration-150",
                  pin.length > i ? "scale-110 border-primary bg-primary" : "border-input bg-transparent",
                )}
              />
            ))}
          </div>
          <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }`}</style>

          {/* Keypad */}
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                disabled={busy}
                onClick={() => press(d)}
                className="tnum h-[58px] rounded-xl border bg-card font-display text-xl font-semibold shadow-soft transition-all hover:bg-secondary active:scale-[0.97] disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <div />
            <button disabled={busy} onClick={() => press("0")} className="tnum h-[58px] rounded-xl border bg-card font-display text-xl font-semibold shadow-soft transition-all hover:bg-secondary active:scale-[0.97] disabled:opacity-50">0</button>
            <button disabled={busy} onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-[58px] items-center justify-center rounded-xl border bg-card text-muted-foreground transition-all hover:bg-secondary active:scale-[0.97]" aria-label="Backspace">
              <Delete className="h-5 w-5" />
            </button>
          </div>

          {busy && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
            </div>
          )}

          {/* Staff quick chips */}
          <div className="mt-8">
            <div className="section-label mb-2">Today&apos;s team</div>
            <div className="grid grid-cols-2 gap-2">
              {HINTS.map((h) => (
                <button
                  key={h.pin}
                  onClick={() => {
                    setPin(h.pin);
                    if (!busy) submit(h.pin);
                  }}
                  className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <span>
                    <span className="block text-[13px] font-semibold leading-tight">{h.name}</span>
                    <span className="text-[11px] text-muted-foreground">{h.role}</span>
                  </span>
                  <RoleBadge role={h.role} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
