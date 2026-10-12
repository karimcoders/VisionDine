/* Customer order status — live tracking + assistance buttons */
"use client";
import { useState } from "react";
import { usePolling } from "@/lib/api";
import { inr } from "@/lib/money";
import { Logo } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BellRing, CheckCircle2, ChefHat, Clock, PackageCheck, Phone, ReceiptText, Search, UtensilsCrossed } from "lucide-react";

type StatusOrder = {
  orderNo: string;
  status: string;
  tableNumber: number | null;
  totalPaise: number;
  createdAt: string;
  billRequested: boolean;
  etaMinutes: number;
  items: { id: string; name: string; qty: number; status: string; variantName: string | null; notes: string | null }[];
};

const STEPS = [
  { key: "PLACED", label: "Order placed", icon: CheckCircle2 },
  { key: "KITCHEN", label: "In the kitchen", icon: ChefHat },
  { key: "READY", label: "Ready to serve", icon: PackageCheck },
  { key: "SERVED", label: "Served", icon: UtensilsCrossed },
];

function stepIndex(o: StatusOrder): number {
  if (o.status === "OPEN") return 0;
  if (o.status === "PREPARING") return 1;
  if (o.status === "READY") return 2;
  if (o.status === "SERVED") return 3;
  return 4;
}

export default function CustomerStatusView({ orderNo, onNewOrder }: { orderNo: string; onNewOrder: () => void }) {
  const { data, loading, error } = usePolling<StatusOrder>(`/api/public?kind=order&orderNo=${encodeURIComponent(orderNo)}`, 5000);
  const [lookup, setLookup] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(kind: "assist" | "bill") {
    setBusy(true);
    try {
      await post("/api/public", { action: "assist", orderNo, bill: kind === "bill" });
      toast({ title: kind === "bill" ? "Bill requested" : "Staff on the way", description: "Humne staff ko bata diya hai." });
    } catch (e) {
      toast({ title: "Could not send", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!orderNo || (error && !data)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <Logo size={36} />
          <div className="mt-6 font-display text-[18px] font-bold">Track your order</div>
          <p className="mt-1 text-[13px] text-muted-foreground">Enter the order number from your confirmation.</p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (lookup.trim()) onTrackRedirect(lookup.trim().toUpperCase());
            }}
          >
            <Input value={lookup} onChange={(e) => setLookup(e.target.value.toUpperCase())} placeholder="VD-0042-X9" className="h-12 flex-1 rounded-2xl text-center font-bold tracking-wider" />
            <Button type="submit" size="icon" className="h-12 w-12 rounded-2xl"><Search className="h-4.5 w-4.5" /></Button>
          </form>
          {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
          <Button variant="ghost" className="mt-4" onClick={onNewOrder}>← Back to menu</Button>
        </div>
      </div>
    );
  }

  function onTrackRedirect(no: string) {
    window.location.search = `?qr=status&orderNo=${encodeURIComponent(no)}`;
  }

  if (loading && !data) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }
  if (!data) return null;

  const idx = stepIndex(data);
  const cancelled = data.status === "CANCELLED" || data.status === "COMPLETED";
  const mins = Math.floor((Date.now() - new Date(data.createdAt).getTime()) / 60000);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b bg-card/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size={28} />
          {data.tableNumber && <span className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-primary">Table {data.tableNumber}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <div className="rounded-3xl border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="section-label">Order</div>
              <div className="tnum font-display text-[22px] font-extrabold">{data.orderNo}</div>
            </div>
            <div className="text-right">
              <div className="section-label">Total</div>
              <div className="tnum font-display text-[20px] font-extrabold text-primary">{inr(data.totalPaise)}</div>
            </div>
          </div>

          {!cancelled ? (
            <div className="mt-5">
              <div className="flex items-start">
                {STEPS.map((s, i) => (
                  <div key={s.key} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <span className={cn("h-0.5 flex-1 rounded", i === 0 ? "bg-transparent" : i <= idx ? "bg-primary" : "bg-input")} />
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all", i <= idx ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground")}>
                        <s.icon className="h-4.5 w-4.5" />
                      </div>
                      <span className={cn("h-0.5 flex-1 rounded", i === STEPS.length - 1 ? "bg-transparent" : i < idx ? "bg-primary" : "bg-input")} />
                    </div>
                    <span className={cn("mt-1.5 text-center text-[10.5px] font-semibold leading-tight", i <= idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-accent/70 py-2.5 text-[13px] font-bold text-accent-foreground">
                <Clock className="h-4 w-4" /> Estimated {data.etaMinutes} min · waiting {mins} min
              </div>
            </div>
          ) : (
            <div className={cn("mt-4 rounded-xl py-3 text-center text-[14px] font-bold", data.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
              {data.status === "COMPLETED" ? "Thank you for dining with us! 🙏" : "This order was cancelled. Please talk to our staff."}
            </div>
          )}
        </div>

        {/* live item status */}
        <div className="mt-4 space-y-2">
          {data.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 shadow-soft">
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold">{i.qty} × {i.name}{i.variantName ? ` (${i.variantName})` : ""}</div>
                {i.notes && <div className="text-[11.5px] italic text-amber-700">"{i.notes}"</div>}
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                i.status === "READY" ? "bg-emerald-50 text-emerald-700" : i.status === "PREPARING" ? "bg-amber-50 text-amber-700" : i.status === "SERVED" ? "bg-stone-100 text-stone-500" : "bg-secondary text-muted-foreground")}>
                {i.status === "QUEUED" ? "Queued" : i.status === "PREPARING" ? "Cooking" : i.status === "READY" ? "Ready" : "Served"}
              </span>
            </div>
          ))}
        </div>

        {/* assistance */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button variant="outline" className="h-12 rounded-2xl gap-2" disabled={busy} onClick={() => request("assist")}>
            <BellRing className="h-4 w-4" /> Call staff
          </Button>
          <Button className="h-12 rounded-2xl gap-2 bg-primary font-bold" disabled={busy} onClick={() => request("bill")}>
            <ReceiptText className="h-4 w-4" /> Get bill
          </Button>
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={onNewOrder}>
          ← Order something else
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          <Phone className="inline h-3 w-3" /> Payment happens at the table — cash, UPI ya card.
        </p>
      </main>
    </div>
  );
}
