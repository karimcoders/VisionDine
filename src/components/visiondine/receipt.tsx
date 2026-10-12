/* Thermal receipt preview + browser print */
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { inr, ORDER_TYPE_LABEL } from "@/lib/money";
import type { ReceiptDTO } from "@/lib/receipt";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { lineDisplayName } from "@/lib/money";

export function ReceiptModal({ orderId, open, onClose }: { orderId: string | null; open: boolean; onClose: () => void }) {
  const [cache, setCache] = useState<{ id: string; data: ReceiptDTO | null } | null>(null);
  const loading = !!orderId && open && cache?.id !== orderId;

  useEffect(() => {
    if (!orderId || !open || cache?.id === orderId) return;
    let cancelled = false;
    api<ReceiptDTO>(`/api/orders/${orderId}/receipt`)
      .then((d) => {
        if (!cancelled) setCache({ id: orderId, data: d });
      })
      .catch(() => {
        if (!cancelled) setCache({ id: orderId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, open, cache?.id]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[400px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center justify-between font-display text-[16px]">
            Receipt
            <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!cache?.data} className="h-8 gap-1.5 rounded-lg">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto bg-secondary/60 px-5 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : cache?.data ? (
            <ReceiptPaper data={cache.data} />
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">Receipt could not be loaded.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiptPaper({ data }: { data: ReceiptDTO }) {
  const o = data.order;
  const dt = new Date(o.createdAt);
  return (
    <div className="print-area mx-auto mt-2 w-full max-w-[320px] rounded-lg bg-white px-5 py-6 font-mono text-[11.5px] leading-[1.55] text-[#1c1917] shadow-soft" style={{ fontFamily: "'Courier New', monospace" }}>
      <div className="text-center">
        <div className="text-[15px] font-bold tracking-wide uppercase">{data.profile?.name || "VisionDine"}</div>
        {data.profile?.address && <div className="text-[10.5px] text-[#57534e]">{data.profile.address}</div>}
        {data.profile?.phone && <div className="text-[10.5px] text-[#57534e]">{data.profile.phone}</div>}
        <div className="mt-0.5 text-[10px] text-[#57534e]">
          {data.profile?.gstin ? `GSTIN: ${data.profile.gstin}` : ""} {data.profile?.fssai ? `· FSSAI: ${data.profile.fssai}` : ""}
        </div>
      </div>
      <div className="my-3 border-t border-dashed border-[#a8a29e]" />
      <div className="grid grid-cols-2 gap-y-0.5">
        <span>Receipt: {o.orderNo}</span>
        <span className="text-right">{dt.toLocaleDateString("en-IN")}</span>
        <span>{ORDER_TYPE_LABEL[o.type] || o.type}{o.tableNumber ? ` · T${o.tableNumber}` : ""}</span>
        <span className="text-right">{dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
        {o.staffName && <span>Billed by: {o.staffName}</span>}
        {o.guestCount ? <span className="text-right">Guests: {o.guestCount}</span> : null}
      </div>
      <div className="my-3 border-t border-dashed border-[#a8a29e]" />
      <table className="w-full">
        <tbody>
          {o.items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="py-[1px] pr-1">{it.qty} ×</td>
              <td className="py-[1px]">
                {lineDisplayName(it.name, it.variantName)}
                {it.notes && <div className="pl-2 text-[10px] text-[#78716c]">** {it.notes}</div>}
              </td>
              <td className="py-[1px] text-right tnum">{inr(it.qty * it.unitPricePaise, { compact: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-3 border-t border-dashed border-[#a8a29e]" />
      <div className="space-y-[2px]">
        <Row k="Subtotal" v={inr(o.subtotalPaise)} />
        {o.discountPaise > 0 && <Row k={`Discount${o.discountReason ? ` (${o.discountReason.split("·")[0].trim()})` : ""}`} v={`-${inr(o.discountPaise)}`} />}
        {o.servicePaise > 0 && <Row k="Service charge" v={inr(o.servicePaise)} />}
        <Row k="GST (incl. in total)" v={inr(o.taxPaise)} />
        <div className="mt-1 flex justify-between border-t border-[#a8a29e] pt-1.5 text-[13.5px] font-bold">
          <span>TOTAL</span>
          <span className="tnum">{inr(o.totalPaise)}</span>
        </div>
        {(o.payments || []).map((p, i) => (
          <Row key={i} k={p.method} v={inr(p.amountPaise)} />
        ))}
      </div>
      <div className="my-3 border-t border-dashed border-[#a8a29e]" />
      <div className="text-center">
        <div className="text-[12px] font-bold tracking-[0.2em]">{o.paymentStatus === "PAID" ? "PAID" : "PAYMENT PENDING"}</div>
        {data.footer && <div className="mt-2 text-[10px] text-[#57534e]">{data.footer}</div>}
        <div className="mt-2 text-[10px] tracking-[0.35em]">|| |||| ||| |||| || ||||</div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span className="tnum">{v}</span>
    </div>
  );
}
