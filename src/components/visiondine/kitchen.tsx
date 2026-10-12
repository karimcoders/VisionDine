/* Kitchen Display System — dark, large touch targets, live timers.
   Workflow: New → Accepted(bump) → Preparing → Ready → Served (waiter marks served). */
"use client";
import { useMemo, useState, useEffect } from "react";
import { patch, usePolling } from "@/lib/api";
import { ORDER_TYPE_LABEL, STATION_LABEL } from "@/lib/money";
import { EmptyState, StatusPill } from "@/components/visiondine/ui-bits";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BellRing, CheckCircle2, ChefHat, Clock, Flame, Loader2 } from "lucide-react";

type Ticket = {
  id: string;
  orderNo: string;
  type: string;
  tableNumber: number | null;
  createdAt: string;
  items: { id: string; name: string; qty: number; variantName: string | null; notes: string | null; station: string; status: string; createdAt: string }[];
  allServed: boolean;
};

const STATIONS = ["ALL", "MAIN", "TANDOOR", "BEVERAGE", "DESSERT"] as const;

export default function KitchenView() {
  const { data, loading, refresh } = usePolling<Ticket[]>("/api/kitchen", 4000);
  const [station, setStation] = useState<(typeof STATIONS)[number]>("ALL");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [, tick] = useState(0);

  // re-render every 15s to age the timers
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const tickets = useMemo(() => {
    let ts = data || [];
    if (station !== "ALL") ts = ts.filter((t) => t.items.some((i) => i.station === station));
    return ts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data, station]);

  const counts = useMemo(() => {
    const ts = data || [];
    return {
      new: ts.filter((t) => t.items.every((i) => i.status === "QUEUED")).length,
      preparing: ts.filter((t) => t.items.some((i) => i.status === "PREPARING")).length,
      ready: ts.filter((t) => t.items.every((i) => i.status === "READY") && t.items.length > 0).length,
      delayed: ts.filter((t) => Date.now() - new Date(t.createdAt).getTime() > 15 * 60000).length,
    };
  }, [data]);

  async function setItemStatus(itemId: string, status: string) {
    setBusyItem(itemId);
    try {
      await patch("/api/kitchen", { itemId, status });
      refresh();
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusyItem(null);
    }
  }

  async function bumpAll(t: Ticket) {
    try {
      await patch("/api/kitchen", { action: "bump-order", orderId: t.id });
      toast({ title: `${t.orderNo} accepted`, description: "All items moved to preparing." });
      refresh();
    } catch (e) {
      toast({ title: "Could not accept", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  const minsSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  return (
    <div className="dark flex h-full flex-col bg-[#101613] text-[#e8ebe8]">
      {/* header strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 font-display text-[15px] font-bold">
          <ChefHat className="h-5 w-5 text-[#2dd4bf]" /> Kitchen Display
        </div>
        <div className="ml-2 flex gap-1.5">
          <KpiChip label="New" value={counts.new} tone="#2dd4bf" />
          <KpiChip label="Preparing" value={counts.preparing} tone="#f59e0b" />
          <KpiChip label="Ready" value={counts.ready} tone="#4ade80" />
          <KpiChip label="Delayed 15m+" value={counts.delayed} tone="#ef6a60" pulse={counts.delayed > 0} />
        </div>
        <div className="ml-auto flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {STATIONS.map((s) => (
            <button key={s} onClick={() => setStation(s)} className={cn("rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold tracking-wide transition-all", station === s ? "bg-[#2dd4bf] text-[#04211d]" : "text-white/60 hover:bg-white/10")}>
              {s === "ALL" ? "ALL" : STATION_LABEL[s].split(" ")[0].toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* tickets grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{[...Array(4)].map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/5" />)}</div>}
        {!loading && tickets.length === 0 && (
          <div className="[&_*]:!text-white/70">
            <EmptyState icon={<ChefHat className="h-5 w-5" />} title="All caught up" hint="New tickets appear here the moment an order is placed." />
          </div>
        )}
        <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4">
          {tickets.map((t) => {
            const age = minsSince(t.createdAt);
            const urgent = age >= 20;
            const warm = age >= 10 && !urgent;
            const queued = t.items.filter((i) => i.status === "QUEUED");
            return (
              <div
                key={t.id}
                className={cn(
                  "flex flex-col rounded-2xl border-2 bg-[#18201c] shadow-xl transition-colors",
                  urgent ? "border-[#ef6a60]" : warm ? "border-[#f59e0b]/70" : "border-white/10",
                )}
              >
                {/* ticket head */}
                <div className={cn("flex items-center justify-between rounded-t-[13px] px-4 py-2.5", urgent ? "bg-[#ef6a60]/15" : warm ? "bg-[#f59e0b]/10" : "bg-white/5")}>
                  <div>
                    <div className="tnum font-display text-[19px] font-extrabold tracking-tight">{t.orderNo}</div>
                    <div className="text-[11.5px] font-semibold text-white/55">
                      {t.tableNumber ? `Table ${t.tableNumber}` : ORDER_TYPE_LABEL[t.type]}
                      {t.type === "QR" && " · QR"}
                    </div>
                  </div>
                  <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 tnum text-[14px] font-extrabold", urgent ? "bg-[#ef6a60] text-white" : warm ? "bg-[#f59e0b] text-[#231a02]" : "bg-white/10 text-white/80")}>
                    <Clock className="h-3.5 w-3.5" /> {age}m
                  </div>
                </div>

                {/* items */}
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
                  {t.items.map((i) => {
                    const itemAge = minsSince(i.createdAt);
                    const visible = station === "ALL" || i.station === station;
                    if (!visible) return (
                      <div key={i.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/35">
                        {i.qty} × {i.name} <span className="ml-1">→ {STATION_LABEL[i.station]}</span>
                      </div>
                    );
                    return (
                      <div key={i.id} className={cn("rounded-xl border px-3 py-2", i.status === "READY" ? "border-emerald-500/40 bg-emerald-950/30" : i.status === "PREPARING" ? "border-amber-500/30 bg-white/[0.04]" : "border-white/10 bg-white/[0.04]")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-display text-[16px] font-bold leading-snug">
                              <span className="tnum text-[#2dd4bf]">{i.qty}×</span> {i.name}
                            </div>
                            {i.variantName && <div className="text-[11.5px] text-white/50">{i.variantName}</div>}
                            {i.notes && (
                              <div className="mt-0.5 flex items-start gap-1 text-[12px] font-semibold text-[#f59e0b]">
                                <BellRing className="mt-0.5 h-3 w-3 shrink-0" /> {i.notes}
                              </div>
                            )}
                            <div className="mt-0.5 text-[10.5px] text-white/40 tnum">
                              {STATION_LABEL[i.station]} · waiting {itemAge}m
                            </div>
                          </div>
                          {busyItem === i.id ? (
                            <Loader2 className="mt-1 h-5 w-5 animate-spin text-white/50" />
                          ) : (
                            <StatusPill tone={i.status === "READY" ? "green" : i.status === "PREPARING" ? "amber" : "gray"} dot={false} className="shrink-0 scale-[0.85]">{i.status}</StatusPill>
                          )}
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {i.status === "QUEUED" && (
                            <button onClick={() => setItemStatus(i.id, "PREPARING")} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#f59e0b] text-[13px] font-extrabold text-[#231a02] transition-transform active:scale-[0.97]">
                              <Flame className="h-4 w-4" /> Start
                            </button>
                          )}
                          {i.status === "QUEUED" && null}
                          {(i.status === "QUEUED" || i.status === "PREPARING") && (
                            <button onClick={() => setItemStatus(i.id, "READY")} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-extrabold transition-transform active:scale-[0.97]", i.status === "PREPARING" ? "flex-1 bg-[#4ade80] text-[#05230f]" : "bg-white/10 text-white/80")}>
                              <CheckCircle2 className="h-4 w-4" /> Ready
                            </button>
                          )}
                          {i.status === "READY" && (
                            <div className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-950/40 text-[13px] font-bold text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" /> Awaiting service
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* footer bump */}
                {queued.length > 0 && (
                  <button onClick={() => bumpAll(t)} className="mx-3 mb-3 flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#2dd4bf]/60 text-[14px] font-extrabold text-[#2dd4bf] transition-colors hover:bg-[#2dd4bf]/10">
                    Accept all ({queued.length})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiChip({ label, value, tone, pulse }: { label: string; value: number; tone: string; pulse?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11.5px] font-semibold text-white/70">
      <span className={cn("h-2 w-2 rounded-full", pulse && "animate-pulse")} style={{ background: tone }} />
      {label} <span className="tnum font-extrabold text-white">{value}</span>
    </span>
  );
}
