/* Owner dashboard — every number from real stored records */
"use client";
import { usePolling } from "@/lib/api";
import { inr, inrShort } from "@/lib/money";
import type { DashboardDTO } from "@/lib/types";
import { EmptyState, Money, SectionLabel, StatCard, StatusPill } from "@/components/visiondine/ui-bits";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, ChefHat, IndianRupee, Package, ReceiptText, ShoppingBag, Timer, TrendingUp } from "lucide-react";

export default function DashboardView() {
  const { data, loading, error } = usePolling<DashboardDTO>("/api/dashboard", 20000);

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}</div>
        <div className="h-72 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }
  if (error || !data) return <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="Could not load dashboard" hint={error || undefined} />;

  const dArrow = data.today.netPaise >= data.yesterdayNetPaise;
  const pct = data.yesterdayNetPaise > 0 ? Math.round(((data.today.netPaise - data.yesterdayNetPaise) / data.yesterdayNetPaise) * 100) : null;
  const chartData = data.series.map((s) => ({ ...s, label: new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }) }));

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          label="Net sales today"
          icon={<IndianRupee className="h-4 w-4" />}
          value={inr(data.today.netPaise)}
          sub={
            <span className={cn("inline-flex items-center gap-1 font-semibold", dArrow ? "text-emerald-600" : "text-red-600")}>
              {dArrow ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {pct === null ? "vs yesterday" : `${Math.abs(pct)}% vs yesterday (${inrShort(data.yesterdayNetPaise)})`}
            </span>
          }
        />
        <StatCard label="Completed orders" icon={<ShoppingBag className="h-4 w-4" />} value={data.today.orders} sub={`${data.today.guests} guests served`} />
        <StatCard label="Avg order value" icon={<ReceiptText className="h-4 w-4" />} value={inr(data.today.aovPaise)} sub={`Gross ${inr(data.today.grossPaise, { compact: true })} · GST included`} />
        <StatCard tone="gold" label="Tables busy" icon={<Timer className="h-4 w-4" />} value={`${data.tablesBusyPct}%`} sub={data.avgPrepMin !== null ? `Avg prep ${data.avgPrepMin} min` : "Prep times coming in"} />
      </div>

      {/* live strip */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card px-4 py-3 shadow-soft">
        <span className="section-label mr-1">Live now</span>
        <StatusPill tone="teal">{data.live.open} open</StatusPill>
        <StatusPill tone="amber" pulse={data.live.preparing > 0}>{data.live.preparing} preparing</StatusPill>
        <StatusPill tone="green">{data.live.ready} ready to serve</StatusPill>
        <span className="tnum ml-auto text-[12.5px] font-semibold text-muted-foreground">Running unpaid: <Money paise={data.live.unpaidTotalPaise} className="text-foreground" /></span>
        {data.delayedOrders.length > 0 && (
          <StatusPill tone="red" pulse>
            {data.delayedOrders.length} delayed &gt;20m · {data.delayedOrders.map((x) => x.orderNo).slice(0, 3).join(", ")}
          </StatusPill>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        {/* 7-day sales */}
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-display text-[15px] font-bold">Last 7 days</div>
              <div className="text-[12px] text-muted-foreground">Net collected sales per day</div>
            </div>
            <span className="tnum font-display text-[18px] font-extrabold text-primary">{inr(data.series.reduce((s, x) => s + x.netPaise, 0))}</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="#e9e4dc" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7c756d" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => inrShort(v).replace("₹", "")} tick={{ fontSize: 10.5, fill: "#7c756d" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(v) => [inr(Number(v)), "Net sales"]}
                  labelFormatter={(l) => `${l}`}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e9e4dc", fontSize: 12.5, fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="netPaise" stroke="#0f766e" strokeWidth={2.5} fill="url(#salesFill)" dot={{ r: 3, fill: "#0f766e" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[12px]">
            <div className="rounded-xl bg-secondary/60 py-2">
              <div className="font-bold tnum">{data.series.reduce((s, x) => s + x.orders, 0)}</div>
              <div className="text-muted-foreground">orders this week</div>
            </div>
            <div className="rounded-xl bg-secondary/60 py-2">
              <div className="font-bold tnum text-emerald-600">{inr(data.refunds7dPaise)}</div>
              <div className="text-muted-foreground">refunds 7d</div>
            </div>
            <div className="rounded-xl bg-secondary/60 py-2">
              <div className="font-bold tnum text-amber-600">{inr(data.wastage7dPaise)}</div>
              <div className="text-muted-foreground">wastage value 7d</div>
            </div>
          </div>
        </div>

        {/* payment mix + top items */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-soft">
            <SectionLabel className="mb-2.5">Payments today</SectionLabel>
            {data.paymentMix.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted-foreground">No payments collected yet today.</p>
            ) : (
              <div className="space-y-2">
                {data.paymentMix.map((p) => {
                  const total = data.paymentMix.reduce((s, x) => s + x.amountPaise, 0);
                  const pctP = Math.round((p.amountPaise / total) * 100);
                  return (
                    <div key={p.method}>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <span className="font-semibold">{p.method}</span>
                        <Money paise={p.amountPaise} className="font-semibold text-muted-foreground" />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div className={cn("h-full rounded-full", p.method === "UPI" ? "bg-teal-600" : p.method === "CASH" ? "bg-[#a16207]" : "bg-stone-500")} style={{ width: `${pctP}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-soft">
            <SectionLabel className="mb-2">Best sellers today</SectionLabel>
            {data.topItems.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted-foreground">First order of the day will appear here.</p>
            ) : (
              <div className="space-y-1.5">
                {data.topItems.slice(0, 6).map((it, idx) => (
                  <div key={it.name} className="flex items-center gap-2.5 text-[13px]">
                    <span className="tnum flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-[11px] font-bold text-muted-foreground">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                    <span className="tnum font-bold">×{it.qty}</span>
                    <Money paise={it.revenuePaise} className="w-16 text-right font-semibold text-muted-foreground" compact />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* alerts row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-2.5 flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
            <SectionLabel>Low stock</SectionLabel>
          </div>
          {data.lowStock.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Everything above minimum levels.</p>
          ) : (
            <div className="space-y-1.5">
              {data.lowStock.map((i) => (
                <div key={i.name} className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12.5px] dark:bg-amber-950/30">
                  <span className="font-semibold">{i.name}</span>
                  <span className="tnum text-amber-700 dark:text-amber-300">{i.qty.toFixed(1)} / min {i.minQty} {i.unit}</span>
                </div>
              ))}
            </div>
          )}
          {data.expiring.length > 0 && (
            <>
              <SectionLabel className="mb-1.5 mt-3">Expiring in 72h</SectionLabel>
              <div className="space-y-1.5">
                {data.expiring.map((i) => (
                  <div key={i.name} className="flex items-center justify-between rounded-lg bg-secondary/70 px-2.5 py-1.5 text-[12.5px]">
                    <span className="font-semibold">{i.name}</span>
                    <span className="text-muted-foreground">{new Date(i.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-2.5 flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            <SectionLabel>Category sales today</SectionLabel>
          </div>
          {data.categorySales.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No sales recorded yet today.</p>
          ) : (
            <div className="space-y-1.5">
              {data.categorySales.slice(0, 7).map((c) => (
                <div key={c.name} className="flex items-center justify-between text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <Money paise={c.amountPaise} className="font-bold" compact />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-2.5 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <SectionLabel>Staff activity today</SectionLabel>
          </div>
          {data.staffActive.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No orders created yet today.</p>
          ) : (
            <div className="space-y-1.5">
              {data.staffActive.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-[13px]">
                  <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{s.name}</span> <span className="text-muted-foreground">· {s.role.toLowerCase()}</span></span>
                  <span className="tnum font-bold">{s.orders} orders</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-xl bg-accent/70 p-3 text-[12px] leading-relaxed text-accent-foreground">
            <TrendingUp className="mb-1 h-3.5 w-3.5" />
            Sales figures are net collected payments — not profit. Taxes and refunds are tracked separately in Reports.
          </div>
        </div>
      </div>
    </div>
  );
}
