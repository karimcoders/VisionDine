/* Orders — live queue, order detail, settle bills, cancel with authorization */
"use client";
import { useMemo, useState } from "react";
import { patch, post, usePolling } from "@/lib/api";
import { useVision } from "@/lib/store";
import { inr, ORDER_TYPE_LABEL } from "@/lib/money";
import type { OrderDTO } from "@/lib/types";
import { Elapsed, EmptyState, Money, SectionLabel, StatusPill, PinDialog } from "@/components/visiondine/ui-bits";
import { ReceiptModal } from "@/components/visiondine/receipt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ClipboardList, Wallet, CreditCard, Loader2, ReceiptText, Search, UtensilsCrossed, XCircle } from "lucide-react";

const STATUS_TONE: Record<string, "teal" | "amber" | "green" | "gold" | "red" | "gray"> = {
  OPEN: "teal", PREPARING: "amber", READY: "green", SERVED: "gold", COMPLETED: "gray", CANCELLED: "red",
};

export default function OrdersView() {
  const { data: active, loading, refresh } = usePolling<OrderDTO[]>("/api/orders?scope=active", 5000);
  const { data: past, refresh: refreshPast } = usePolling<OrderDTO[]>("/api/orders?scope=completed&limit=40", 15000);
  const [tab, setTab] = useState<"live" | "past">("live");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<OrderDTO | null>(null);
  const [payFor, setPayFor] = useState<OrderDTO | null>(null);
  const [cancelFor, setCancelFor] = useState<OrderDTO | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const list = useMemo(() => {
    const src = (tab === "live" ? active : past) || [];
    if (!q.trim()) return src;
    const s = q.toLowerCase();
    return src.filter((o) => o.orderNo.toLowerCase().includes(s) || String(o.tableNumber || "").includes(s) || (o.customerName || "").toLowerCase().includes(s));
  }, [active, past, tab, q]);

  async function markServed(o: OrderDTO) {
    try {
      await patch("/api/orders", { orderId: o.id, action: "mark-served" });
      toast({ title: `${o.orderNo} served` });
      refresh();
      setDetail(null);
    } catch (e) {
      toast({ title: "Could not update", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function cancelOrder(pin?: string) {
    if (!cancelFor) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      await patch("/api/orders", { orderId: cancelFor.id, action: "cancel", reason: reason.trim(), managerPin: pin });
      toast({ title: `${cancelFor.orderNo} cancelled`, description: "Recorded in the audit log." });
      setCancelFor(null);
      setReason("");
      setPinOpen(false);
      refresh();
      refreshPast();
      setDetail(null);
    } catch (e) {
      toast({ title: "Could not cancel", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="flex rounded-xl border bg-card p-1">
          {(["live", "past"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-[12.5px] font-semibold capitalize", tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              {t === "live" ? "Live orders" : "History"}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no, table, guest…" className="h-10 rounded-xl pl-9" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary" />)}</div>}
        {!loading && list.length === 0 && (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={tab === "live" ? "No live orders" : "No history found"} hint={tab === "live" ? "Orders sent from the POS or QR appear here instantly." : "Completed and cancelled orders show up here."} />
        )}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((o) => (
            <button key={o.id} onClick={() => setDetail(o)} className="flex flex-col rounded-2xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-center justify-between gap-2">
                <span className="tnum font-display text-[16px] font-extrabold">{o.orderNo}</span>
                <StatusPill tone={STATUS_TONE[o.status] || "gray"} pulse={o.status === "PREPARING"}>{o.status.replace("_", " ")}</StatusPill>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                <span>{ORDER_TYPE_LABEL[o.type]}</span>
                {o.tableNumber && <span>· Table {o.tableNumber}</span>}
                {o.createdVia === "QR" && <span className="font-semibold text-primary">· QR</span>}
                {o.customerName && <span>· {o.customerName}</span>}
                <span>· <Elapsed since={o.createdAt} /></span>
              </div>
              <div className="mt-2.5 max-h-24 space-y-0.5 overflow-y-auto text-[12.5px]">
                {o.items.slice(0, 4).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{i.qty} × {i.name}</span>
                    <StatusPill tone={i.status === "READY" ? "green" : i.status === "SERVED" ? "gray" : i.status === "PREPARING" ? "amber" : "outline"} dot={false} className="scale-[0.82]">{i.status}</StatusPill>
                  </div>
                ))}
                {o.items.length > 4 && <div className="text-[11.5px] text-muted-foreground">+{o.items.length - 4} more</div>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                <span className="text-[11.5px] font-semibold text-muted-foreground">{o.paymentStatus === "PAID" ? "Paid" : "Unpaid"}{o.staffName ? ` · ${o.staffName.split(" ")[0]}` : ""}</span>
                <Money paise={o.totalPaise} className="font-display text-[16px] font-extrabold text-primary" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail sheet */}
      <Dialog open={!!detail} onOpenChange={(o) => (!o ? setDetail(null) : undefined)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center justify-between">
                  <span className="tnum">{detail.orderNo}</span>
                  <StatusPill tone={STATUS_TONE[detail.status] || "gray"}>{detail.status.replace("_", " ")}</StatusPill>
                </DialogTitle>
              </DialogHeader>
              <div className="text-[12.5px] text-muted-foreground">
                {ORDER_TYPE_LABEL[detail.type]}{detail.tableNumber ? ` · Table ${detail.tableNumber}` : ""} · {new Date(detail.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                {detail.staffName ? ` · by ${detail.staffName}` : ""}{detail.createdVia === "QR" ? " · QR order" : ""}
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border bg-secondary/40 p-3">
                {detail.items.map((i) => (
                  <div key={i.id} className="flex items-start justify-between gap-2 text-[13px]">
                    <div>
                      <span className="tnum font-semibold">{i.qty} ×</span> {i.name}{i.variantName ? ` (${i.variantName})` : ""}
                      {i.notes && <div className="text-[11.5px] italic text-amber-700">↳ {i.notes}</div>}
                    </div>
                    <Money paise={i.qty * i.unitPricePaise} className="font-semibold" compact />
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><Money paise={detail.subtotalPaise} /></div>
                {detail.discountPaise > 0 && <div className="flex justify-between text-emerald-600"><span>Discount {detail.discountReason ? `(${detail.discountReason.split("·")[0].trim()})` : ""}</span><Money paise={-detail.discountPaise} /></div>}
                <div className="flex justify-between text-muted-foreground"><span>GST</span><Money paise={detail.taxPaise} /></div>
                <div className="flex justify-between font-display text-[16px] font-extrabold"><span>Total</span><Money paise={detail.totalPaise} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["OPEN", "PREPARING", "READY"].includes(detail.status) && (
                  <Button variant="outline" className="rounded-xl" onClick={() => markServed(detail)}>
                    <UtensilsCrossed className="mr-1 h-4 w-4" /> Mark served
                  </Button>
                )}
                {detail.paymentStatus !== "PAID" && detail.status !== "CANCELLED" && (
                  <Button className="rounded-xl bg-primary font-bold" onClick={() => { setPayFor(detail); setDetail(null); }}>
                    <Wallet className="mr-1 h-4 w-4" /> Settle bill
                  </Button>
                )}
                {detail.paymentStatus === "PAID" && (
                  <Button variant="outline" className="rounded-xl" onClick={() => setReceiptId(detail.id)}>
                    <ReceiptText className="mr-1 h-4 w-4" /> Receipt
                  </Button>
                )}
                {!["CANCELLED", "COMPLETED"].includes(detail.status) && (
                  <Button variant="outline" className="rounded-xl text-destructive" onClick={() => { setCancelFor(detail); setDetail(null); }}>
                    <XCircle className="mr-1 h-4 w-4" /> Cancel order
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Settle existing unpaid order */}
      {payFor && <SettleDialog order={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); refresh(); refreshPast(); }} />}
      {/* Cancel with reason + optional manager PIN */}
      <Dialog open={!!cancelFor} onOpenChange={(o) => (!o ? setCancelFor(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Cancel {cancelFor?.orderNo}</DialogTitle></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — e.g. guest left, duplicate entry" className="h-11 rounded-xl" />
          <p className="text-[11.5px] text-muted-foreground">Cancellations are permanent and recorded in the audit log with your name.</p>
          <Button variant="destructive" className="h-11 rounded-xl" onClick={() => (isManagerish() ? cancelOrder() : setPinOpen(true))}>
            {isManagerish() ? "Cancel order" : "Continue with manager PIN"}
          </Button>
        </DialogContent>
      </Dialog>
      <PinDialog open={pinOpen} title="Manager authorization" description="Order cancellation needs a manager PIN." onClose={() => setPinOpen(false)} onSubmit={(pin) => cancelOrder(pin)} />
      <ReceiptModal orderId={receiptId} open={!!receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
}

function isManagerish(): boolean {
  const role = useVision.getState().auth?.role;
  return role === "OWNER" || role === "MANAGER";
}

/* ---------- settle an existing unpaid order ---------- */
function SettleDialog({ order, onClose, onPaid }: { order: OrderDTO; onClose: () => void; onPaid: () => void }) {
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD">("CASH");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  async function settle() {
    setBusy(true);
    try {
      await post(`/api/orders/${order.id}/pay`, { method, reference: reference || undefined, idempotencyKey: crypto.randomUUID() });
      toast({ title: `${order.orderNo} settled`, description: `${inr(order.totalPaise)} received.` });
      setReceiptId(order.id);
      onPaid();
    } catch (e) {
      toast({ title: "Payment failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Settle {order.orderNo}</DialogTitle></DialogHeader>
          <div className="rounded-2xl bg-accent/60 p-4 text-center">
            <div className="section-label">Amount due</div>
            <div className="tnum font-display text-[32px] font-extrabold text-primary">{inr(order.totalPaise)}</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([{ m: "CASH", icon: CashRegister, l: "Cash" }, { m: "UPI", icon: CreditCard, l: "UPI" }, { m: "CARD", icon: CreditCard, l: "Card" }] as const).map(({ m, l }) => (
              <button key={m} onClick={() => setMethod(m)} className={cn("rounded-xl border py-2.5 text-[12.5px] font-semibold", method === m ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:bg-secondary")}>
                {l}
              </button>
            ))}
          </div>
          {method !== "CASH" && <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (UTR / last 4)" className="h-10 rounded-xl" />}
          <Button className="h-12 rounded-xl font-display text-[15px] font-bold" disabled={busy} onClick={settle}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Mark received · {inr(order.totalPaise)}
          </Button>
        </DialogContent>
      </Dialog>
      <ReceiptModal orderId={receiptId} open={!!receiptId} onClose={() => setReceiptId(null)} />
    </>
  );
}
