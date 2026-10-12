/* Billing history — completed payments, refunds, receipts */
"use client";
import { useMemo, useState } from "react";
import { patch, post, usePolling } from "@/lib/api";
import { useVision } from "@/lib/store";
import { inr } from "@/lib/money";
import type { OrderDTO } from "@/lib/types";
import { EmptyState, Money, PinDialog, StatusPill } from "@/components/visiondine/ui-bits";
import { ReceiptModal } from "@/components/visiondine/receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ReceiptText, RotateCcw, Search, Wallet } from "lucide-react";

export default function BillingView() {
  const { data: paid, loading, refresh } = usePolling<OrderDTO[]>("/api/orders?scope=completed&limit=80", 15000);
  const { data: unpaid } = usePolling<OrderDTO[]>("/api/orders?scope=unpaid", 12000);
  const [tab, setTab] = useState<"paid" | "unpaid">("paid");
  const [q, setQ] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<OrderDTO | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [reason, setReason] = useState("");

  const list = useMemo(() => {
    const src = (tab === "paid" ? paid : unpaid) || [];
    if (!q.trim()) return src;
    const s = q.toLowerCase();
    return src.filter((o) => o.orderNo.toLowerCase().includes(s) || (o.customerName || "").toLowerCase().includes(s));
  }, [paid, unpaid, tab, q]);

  const totalPaid = (paid || []).filter((o) => o.status === "COMPLETED").reduce((s, o) => s + o.totalPaise, 0);

  async function doRefund(pin?: string) {
    if (!refundFor) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      await patch("/api/orders", { orderId: refundFor.id, action: "refund", reason: reason.trim(), managerPin: pin });
      toast({ title: "Refund recorded", description: `${refundFor.orderNo} · logged in audit trail.` });
      setRefundFor(null);
      setReason("");
      setPinOpen(false);
      refresh();
    } catch (e) {
      toast({ title: "Refund failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="flex rounded-xl border bg-card p-1">
          {(["paid", "unpaid"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-[12.5px] font-semibold", tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              {t === "paid" ? "Settled bills" : `Pending${unpaid?.length ? ` (${unpaid.length})` : ""}`}
            </button>
          ))}
        </div>
        <span className="tnum ml-2 text-[12.5px] font-semibold text-muted-foreground">Collected: <Money paise={totalPaid} className="text-foreground" /></span>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt no or guest…" className="h-10 rounded-xl pl-9" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />)}</div>}
        {!loading && list.length === 0 && <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="Nothing here" hint={tab === "paid" ? "Settled bills appear with their receipts." : "All bills are settled."} />}
        <div className="space-y-2">
          {list.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-soft">
              <div className="min-w-[130px]">
                <div className="tnum text-[14px] font-extrabold">{o.orderNo}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {new Date(o.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {o.tableNumber ? ` · T${o.tableNumber}` : ""}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {o.payments?.length ? (
                  o.payments.map((p, i) => <StatusPill key={i} tone={p.method === "UPI" ? "teal" : p.method === "CASH" ? "gold" : "gray"} dot={false}>{p.method} {inr(p.amountPaise)}</StatusPill>)
                ) : (
                  <StatusPill tone="amber" dot={false}>{o.status === "CANCELLED" ? "Cancelled" : "Unpaid"}</StatusPill>
                )}
                {o.discountPaise > 0 && <StatusPill tone="green" dot={false}>−{inr(o.discountPaise)}</StatusPill>}
              </div>
              <Money paise={o.totalPaise} className="font-display text-[16px] font-extrabold" />
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg" onClick={() => setReceiptId(o.id)}>
                  <ReceiptText className="h-3.5 w-3.5" /> Receipt
                </Button>
                {o.status === "COMPLETED" && (
                  <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-destructive" onClick={() => setRefundFor(o)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Refund
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!refundFor} onOpenChange={(o) => (!o ? setRefundFor(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Refund {refundFor?.orderNo}</DialogTitle></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — wrong item, guest complaint…" className="h-11 rounded-xl" />
          <Button variant="destructive" className="h-11 rounded-xl gap-1.5" onClick={() => (["OWNER", "MANAGER"].includes(useVision.getState().auth?.role || "") ? doRefund() : setPinOpen(true))}>
            <Wallet className="h-4 w-4" /> Record refund · {refundFor ? inr(refundFor.totalPaise) : ""}
          </Button>
        </DialogContent>
      </Dialog>
      <PinDialog open={pinOpen} title="Manager authorization" description="Refunds need a manager PIN." onClose={() => setPinOpen(false)} onSubmit={(pin) => doRefund(pin)} />
      <ReceiptModal orderId={receiptId} open={!!receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
}
