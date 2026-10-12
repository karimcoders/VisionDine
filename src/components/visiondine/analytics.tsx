/* Reports & analytics — range filters, real aggregates, CSV export */
"use client";
import { useState } from "react";
import { usePolling } from "@/lib/api";
import { inr, inrShort, ORDER_TYPE_LABEL } from "@/lib/money";
import type { AnalyticsDTO } from "@/lib/types";
import { EmptyState, Money, SectionLabel, StatCard } from "@/components/visiondine/ui-bits";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Download, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function AnalyticsView() {
  const [days, setDays] = useState(7);
  const { data, loading } = usePolling<AnalyticsDTO>(`/api/analytics?days=${days}`);

  function exportCSV() {
    if (!data) return;
    const rows: string[][] = [
      ["VisionDine — Sales Report"],
      [`Range: last ${days} days`],
      [],
      ["Date", "Net Sales (₹)", "Orders"],
      ...data.series.map((s) => [s.date, (s.netPaise / 100).toFixed(2), String(s.orders)]),
      [],
      ["Top Items", "Qty Sold", "Revenue (₹)"],
      ...data.topItems.map((i) => [i.name, String(i.qty), (i.revenuePaise / 100).toFixed(2)]),
      [],
      ["Payment Method", "Collected (₹)"],
      ...data.paymentMix.map((p) => [p.method, (p.amountPaise / 100).toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `visiondine-report-${days}d.csv`;
    a.click();
    toast({ title: "Report exported", description: "CSV downloaded." });
  }

  if (loading) return <div className="space-y-4 p-6">{[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary" />)}</div>;
  if (!data) return <EmptyState title="No data" />;

  const chart = data.series.map((s) => ({ ...s, label: new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }));

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border bg-card p-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} className={cn("rounded-lg px-4 py-1.5 text-[12.5px] font-semibold", days === r.days ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-xl border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-secondary">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" label="Net sales" value={inr(data.totals.netPaise)} sub={`${data.totals.orders} completed orders`} />
        <StatCard label="Gross (before disc.)" value={inr(data.totals.grossPaise)} sub={`Discounts ${inr(data.totals.discountsPaise, { compact: true })}`} />
        <StatCard label="Avg order value" value={inr(data.totals.aovPaise)} sub="Net / completed order" />
        <StatCard tone="gold" label="GST collected" value={inr(data.totals.taxPaise)} sub={`Refunds ${inr(data.refunds.amountPaise, { compact: true })} · ${data.cancelled} cancelled`} />
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="mb-3 font-display text-[15px] font-bold">Daily net sales</div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#e9e4dc" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#7c756d" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => inrShort(v).replace("₹", "")} tick={{ fontSize: 10.5, fill: "#7c756d" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v) => [inr(Number(v)), "Net"]} contentStyle={{ borderRadius: 12, border: "1px solid #e9e4dc", fontSize: 12.5, fontWeight: 600 }} />
              <Bar dataKey="netPaise" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <SectionLabel className="mb-2.5">Top items by revenue</SectionLabel>
          <div className="space-y-2">
            {data.topItems.map((it, i) => (
              <div key={it.name} className="flex items-center gap-2.5 text-[13px]">
                <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                <span className="tnum text-muted-foreground">×{it.qty}</span>
                <Money paise={it.revenuePaise} className="w-20 text-right font-bold" compact />
              </div>
            ))}
          </div>
          {data.slowItems.length > 0 && (
            <>
              <SectionLabel className="mb-1.5 mt-4">Not selling this period</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {data.slowItems.map((s) => (
                  <span key={s.name} className="rounded-full bg-secondary px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">{s.name}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <SectionLabel className="mb-2.5">Payment mix</SectionLabel>
          <div className="space-y-2">
            {data.paymentMix.map((p) => {
              const total = data.paymentMix.reduce((s, x) => s + x.amountPaise, 0) || 1;
              return (
                <div key={p.method}>
                  <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{p.method}</span><Money paise={p.amountPaise} className="text-muted-foreground" /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((p.amountPaise / total) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <SectionLabel className="mb-1.5 mt-4">Order types</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.typeMix.map((t) => (
              <span key={t.type} className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold">
                {ORDER_TYPE_LABEL[t.type] || t.type} · {t.orders}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <SectionLabel className="mb-2.5">Category performance</SectionLabel>
          <div className="space-y-1.5">
            {data.categorySales.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-[13px]">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <Money paise={c.amountPaise} className="font-bold" compact />
              </div>
            ))}
          </div>
          <SectionLabel className="mb-1.5 mt-4">Peak hours (orders)</SectionLabel>
          <div className="flex h-20 items-end gap-1">
            {data.hourly.filter((h) => h.orders > 0).map((h) => {
              const max = Math.max(...data.hourly.map((x) => x.orders), 1);
              return (
                <div key={h.hour} className="group relative flex-1" title={`${h.hour}:00 — ${h.orders} orders · ${inr(h.netPaise)}`}>
                  <div className="rounded-t bg-teal-600/80 group-hover:bg-teal-600" style={{ height: `${(h.orders / max) * 64}px` }} />
                  <div className="mt-0.5 text-center text-[9px] text-muted-foreground tnum">{h.hour}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent/70 p-3 text-[12px] leading-relaxed text-accent-foreground">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            All figures reconcile with stored transactions — net sales exclude tax-inclusive amounts already inside menu prices.
          </div>
        </div>
      </div>
    </div>
  );
}
