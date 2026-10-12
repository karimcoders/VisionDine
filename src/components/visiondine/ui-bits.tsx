/* VisionDine shared UI atoms — the small details that carry the brand */
"use client";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";

/* --- Brand mark: minimal monogram plate --- */
export function Logo({ size = 34, withWord = true, dark = false }: { size?: number; withWord?: boolean; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="37" height="37" rx="11" className={dark ? "fill-[#2dd4bf]" : "fill-primary"} />
        <path d="M12 13.5 L20 27 L28 13.5" stroke={dark ? "#04211d" : "#f0fdfa"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="20" cy="30.4" r="1.7" fill={dark ? "#04211d" : "#f0fdfa"} opacity="0.85" />
      </svg>
      {withWord && (
        <span className={cn("font-display font-bold tracking-tight leading-none", dark ? "text-white" : "text-foreground")} style={{ fontSize: size * 0.55 }}>
          Vision<span className={dark ? "text-[#2dd4bf]" : "text-primary"}>Dine</span>
        </span>
      )}
    </span>
  );
}

/* --- Indian veg/non-veg mark (FSSAI-style square + dot) --- */
export function VegMark({ diet, size = 14 }: { diet: string; size?: number }) {
  const color = diet === "NONVEG" ? "#7a2e1d" : diet === "EGG" ? "#b45309" : "#166534";
  const label = diet === "NONVEG" ? "Non-veg" : diet === "EGG" ? "Contains egg" : diet === "VEGAN" ? "Vegan" : "Veg";
  return (
    <span title={label} className="inline-flex items-center justify-center rounded-[3px] border-[1.5px]" style={{ width: size, height: size, borderColor: color }}>
      <span className="rounded-full" style={{ width: size * 0.44, height: size * 0.44, background: diet === "VEGAN" ? "transparent" : color, border: diet === "VEGAN" ? `1.5px solid ${color}` : "none" }} />
    </span>
  );
}

/* --- Status pill with dot --- */
const TONES: Record<string, string> = {
  gray: "bg-secondary text-secondary-foreground border-transparent",
  teal: "bg-accent text-accent-foreground border-transparent",
  green: "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-950/50 dark:text-amber-300",
  red: "bg-red-50 text-red-700 border-transparent dark:bg-red-950/50 dark:text-red-300",
  gold: "bg-[#faf3e3] text-[#8a5a06] border-transparent dark:bg-yellow-950/40 dark:text-yellow-300",
  outline: "bg-transparent text-muted-foreground border-border",
};
const DOT_TONES: Record<string, string> = {
  gray: "bg-stone-400", teal: "bg-teal-600", green: "bg-emerald-600",
  amber: "bg-amber-500", red: "bg-red-600", gold: "bg-yellow-600", outline: "bg-stone-400",
};
export function StatusPill({ tone = "gray", dot = true, children, className, pulse }: { tone?: keyof typeof TONES; dot?: boolean; children: React.ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT_TONES[tone], pulse && "animate-pulse")} />}
      {children}
    </span>
  );
}

/* --- Money --- */
export function Money({ paise, className, compact }: { paise: number; className?: string; compact?: boolean }) {
  return <span className={cn("tnum", className)}>{inr(paise, { compact })}</span>;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("section-label", className)}>{children}</div>;
}

/* --- KPI stat card --- */
export function StatCard({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "teal" | "gold" | "plain"; icon?: React.ReactNode }) {
  return (
    <div className={cn(
      "rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift",
      tone === "teal" && "border-primary/15 bg-gradient-to-br from-accent/80 to-card",
      tone === "gold" && "border-[#a16207]/15 bg-gradient-to-br from-[#fdf7e7] to-card dark:from-yellow-950/20",
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="section-label">{label}</span>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <div className="mt-1.5 font-display text-[26px] font-bold tracking-tight leading-none tnum">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* --- Empty state --- */
export function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">{icon}</div>
      <div className="font-display text-[15px] font-semibold">{title}</div>
      {hint && <div className="max-w-sm text-[13px] text-muted-foreground">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const tone = role === "OWNER" ? "gold" : role === "MANAGER" ? "teal" : role === "KITCHEN" ? "amber" : "gray";
  return <StatusPill tone={tone as "gold"} dot={false}>{role.charAt(0) + role.slice(1).toLowerCase()}</StatusPill>;
}

/* --- Manager PIN dialog (authorization for sensitive actions) --- */
export function PinDialog({
  open, title, description, onSubmit, onClose, busy,
}: {
  open: boolean; title: string; description?: string;
  onSubmit: (pin: string) => void; onClose: () => void; busy?: boolean;
}) {
  const [pin, setPin] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lift">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary"><ShieldCheck className="h-4.5 w-4.5" /></span>
          <div>
            <div className="font-display text-[16px] font-bold">{title}</div>
            {description && <div className="text-xs text-muted-foreground">{description}</div>}
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 4) {
              onSubmit(pin);
              setPin("");
            }
          }}
          className="mt-5 space-y-3"
        >
          <Input
            autoFocus inputMode="numeric" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Manager PIN" className="text-center text-2xl tracking-[0.6em] tnum h-12"
          />
          <Button type="submit" disabled={pin.length !== 4 || busy} className="w-full h-11">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Authorize
          </Button>
        </form>
      </div>
    </div>
  );
}

/* --- small elapsed-time chip used in KDS/tables --- */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  const tone = mins >= 25 ? "text-red-600" : mins >= 12 ? "text-amber-600" : "text-muted-foreground";
  return <span className={cn("tnum font-semibold", tone, className)}>{mins}m</span>;
}
