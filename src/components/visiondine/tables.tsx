/* Tables & floor plan — visual tiles, reservations, transfers, merges */
"use client";
import { useState } from "react";
import { patch, post, usePolling } from "@/lib/api";
import { inr, ORDER_TYPE_LABEL } from "@/lib/money";
import type { OrderDTO, TableDTO } from "@/lib/types";
import { Elapsed, EmptyState, Money, SectionLabel, StatusPill, VegMark } from "@/components/visiondine/ui-bits";
import { ReceiptModal } from "@/components/visiondine/receipt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Armchair, ArrowRightLeft, Layers, Loader2, Plus, ReceiptText, Users, X, CalendarPlus } from "lucide-react";

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  AVAILABLE: { label: "Available", cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30", dot: "bg-emerald-500" },
  OCCUPIED: { label: "Occupied", cls: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30", dot: "bg-amber-500" },
  RESERVED: { label: "Reserved", cls: "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30", dot: "bg-violet-500" },
  INACTIVE: { label: "Inactive", cls: "opacity-50", dot: "bg-stone-400" },
};

export default function TablesView() {
  const { data: tables, loading, refresh } = usePolling<TableDTO[]>("/api/tables", 6000);
  const { data: activeOrders, refresh: refreshOrders } = usePolling<OrderDTO[]>("/api/orders?scope=active", 6000);
  const [detail, setDetail] = useState<TableDTO | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [resvFor, setResvFor] = useState<TableDTO | null>(null);
  const [transferFor, setTransferFor] = useState<TableDTO | null>(null);
  const [mergeSource, setMergeSource] = useState<TableDTO | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const zones = [...new Set((tables || []).map((t) => t.zone))];
  const orderFor = (t: TableDTO) => activeOrders?.find((o) => o.tableNumber === t.number && ["OPEN", "PREPARING", "READY", "SERVED"].includes(o.status));

  async function openTable(t: TableDTO, guestCount: number) {
    try {
      await patch("/api/tables", { kind: "open-table", tableId: t.id, guestCount });
      toast({ title: `Table ${t.number} opened`, description: `${guestCount} guests · start the order from POS.` });
      setDetail(null);
      refresh();
    } catch (e) {
      toast({ title: "Could not open table", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function freeTable(t: TableDTO) {
    await patch("/api/tables", { kind: "free-table", tableId: t.id });
    toast({ title: `Table ${t.number} set available` });
    setDetail(null);
    refresh();
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-[12px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Occupied</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Reserved</span>
        </div>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => setOpenNew(true)}>
          <Plus className="h-4 w-4" /> Add table
        </Button>
      </div>

      {loading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{[...Array(10)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary" />)}</div>}

      {zones.map((zone) => (
        <div key={zone} className="mb-6">
          <SectionLabel className="mb-2">{zone}</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {(tables || []).filter((t) => t.zone === zone).map((t) => {
              const meta = STATUS_META[t.status] || STATUS_META.AVAILABLE;
              const ord = orderFor(t);
              const busy = !!ord;
              return (
                <button
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className={cn("group relative flex flex-col rounded-2xl border-2 p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift", meta.cls)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="tnum font-display text-[26px] font-extrabold leading-none">{t.number}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                        <Users className="h-3 w-3" /> {t.seats} seats
                      </div>
                    </div>
                    <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", busy ? "bg-amber-500" : meta.dot, busy && "animate-pulse")} />
                  </div>
                  {busy && ord ? (
                    <div className="mt-2.5 space-y-1">
                      <div className="tnum text-[12px] font-bold text-amber-800 dark:text-amber-300">{ord.orderNo} · {ORDER_TYPE_LABEL[ord.type]}</div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">{ord.items.reduce((s, i) => s + i.qty, 0)} items</span>
                        <Money paise={ord.totalPaise} className="font-bold" />
                      </div>
                      {ord.status === "READY" && <StatusPill tone="green" pulse>Ready to serve</StatusPill>}
                      {ord.billRequested && <StatusPill tone="gold" dot={false}>Bill requested</StatusPill>}
                      <div className="text-[11px] text-muted-foreground">since <Elapsed since={ord.createdAt} /> ago</div>
                    </div>
                  ) : (
                    <div className="mt-auto pt-3 text-[12px] font-semibold text-muted-foreground">{t.status === "RESERVED" ? "Reserved" : "Tap to open"}</div>
                  )}
                  {t.activeReservations.length > 0 && (
                    <span className="absolute right-3 top-3 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      {t.activeReservations.length} reserved
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!loading && !tables?.length && <EmptyState icon={<Armchair className="h-5 w-5" />} title="No tables yet" hint="Add tables to build your floor plan." action={<Button onClick={() => setOpenNew(true)}>Add table</Button>} />}

      {/* Table detail */}
      <Dialog open={!!detail} onOpenChange={(o) => (!o ? setDetail(null) : undefined)}>
        <DialogContent className="max-w-md">
          {detail && (() => {
            const ord = orderFor(detail);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display flex items-center gap-3">
                    <span className="tnum text-[28px] font-extrabold">{detail.number}</span>
                    <span className="text-[14px] font-semibold text-muted-foreground">{detail.zone} · {detail.seats} seats</span>
                  </DialogTitle>
                </DialogHeader>
                {ord ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-secondary/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-[15px] font-bold tnum">{ord.orderNo}</span>
                        <StatusPill tone={ord.status === "READY" ? "green" : "amber"} pulse={ord.status === "PREPARING"}>{ord.status}</StatusPill>
                      </div>
                      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-[13px]">
                        {ord.items.map((i) => (
                          <div key={i.id} className="flex justify-between">
                            <span className="text-muted-foreground">{i.qty} × {i.name}{i.variantName ? ` (${i.variantName})` : ""}</span>
                            <Money paise={i.qty * i.unitPricePaise} className="font-semibold" compact />
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between border-t pt-2 font-display text-[15px] font-bold">
                        <span>Total</span><Money paise={ord.totalPaise} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="rounded-xl" onClick={() => { setTransferFor(detail); setDetail(null); }}>
                        <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transfer
                      </Button>
                      <Button variant="outline" className="rounded-xl" onClick={() => setReceiptId(ord.id)}>
                        <ReceiptText className="mr-1 h-3.5 w-3.5" /> Bill preview
                      </Button>
                      <Button variant="outline" className="rounded-xl" onClick={() => setMergeSource(detail)}>
                        <Layers className="mr-1 h-3.5 w-3.5" /> Merge
                      </Button>
                      <Button variant="outline" className="rounded-xl text-destructive" onClick={() => freeTable(detail)}>
                        Free table
                      </Button>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">Settle payments from the Orders screen — receipts stay linked to {ord.orderNo}.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.activeReservations.length > 0 && (
                      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                        <SectionLabel className="mb-1.5">Reservations</SectionLabel>
                        {detail.activeReservations.map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-1 text-[13px]">
                            <span className="font-semibold">{r.guestName} · {r.guestCount} guests</span>
                            <span className="text-muted-foreground">{new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                        <Button size="sm" variant="outline" className="mt-2 rounded-lg" onClick={async () => {
                          await patch("/api/tables", { kind: "seat-reservation", id: detail.activeReservations[0].id });
                          toast({ title: "Guests seated" });
                          setDetail(null); refresh();
                        }}>
                          Seat guests
                        </Button>
                      </div>
                    )}
                    <div>
                      <SectionLabel className="mb-1.5">Open table</SectionLabel>
                      <div className="flex gap-1.5">
                        {[2, 3, 4, 6].map((n) => (
                          <button key={n} onClick={() => openTable(detail, n)} disabled={n > detail.seats} className="tnum h-10 flex-1 rounded-xl border text-[14px] font-bold hover:border-primary hover:bg-accent disabled:opacity-40">
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11.5px] text-muted-foreground">Guest count — then start the order from the POS terminal.</p>
                    </div>
                    <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={() => { setResvFor(detail); setDetail(null); }}>
                      <CalendarPlus className="h-4 w-4" /> Book reservation
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <TransferDialog table={transferFor} tables={tables || []} onClose={() => setTransferFor(null)} onDone={() => { setTransferFor(null); refresh(); refreshOrders(); }} />
      {/* Merge dialog */}
      <MergeDialog source={mergeSource} orders={activeOrders || []} onClose={() => setMergeSource(null)} onDone={() => { setMergeSource(null); refresh(); refreshOrders(); }} />
      {/* New table */}
      <NewTableDialog open={openNew} onClose={() => setOpenNew(false)} onDone={() => { setOpenNew(false); refresh(); }} />
      {/* Reservation */}
      <ReservationDialog table={resvFor} onClose={() => setResvFor(null)} onDone={() => { setResvFor(null); refresh(); }} />
      <ReceiptModal orderId={receiptId} open={!!receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
}

function TransferDialog({ table, tables, onClose, onDone }: { table: TableDTO | null; tables: TableDTO[]; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!table) return null;
  const targets = tables.filter((t) => t.id !== table.id && t.status === "AVAILABLE");
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Move order from Table {table.number}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-2">
          {targets.map((t) => (
            <button key={t.id} disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                const ord = await fetch(`/api/orders?scope=active&tableId=${table.id}`).then((r) => r.json());
                await patch("/api/orders", { orderId: ord[0].id, action: "transfer", toTableId: t.id });
                toast({ title: `Moved to Table ${t.number}` });
                onDone();
              } catch (e) {
                toast({ title: "Transfer failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
              } finally {
                setBusy(false);
              }
            }} className="tnum rounded-xl border py-3 font-display text-[17px] font-bold hover:border-primary hover:bg-accent disabled:opacity-40">
              {t.number}
            </button>
          ))}
          {targets.length === 0 && <p className="col-span-5 py-4 text-center text-sm text-muted-foreground">No free tables right now.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ source, orders, onClose, onDone }: { source: TableDTO | null; orders: OrderDTO[]; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!source) return null;
  const sourceOrder = orders.find((o) => o.tableNumber === source.number && ["OPEN", "PREPARING", "READY", "SERVED"].includes(o.status));
  const others = orders.filter((o) => o.id !== sourceOrder?.id && ["OPEN", "PREPARING", "READY", "SERVED"].includes(o.status));
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Merge Table {source.number} into…</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {others.map((o) => (
            <button key={o.id} disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await patch("/api/orders", { orderId: sourceOrder!.id, action: "merge", targetOrderId: o.id });
                toast({ title: `Merged into ${o.orderNo}` });
                onDone();
              } catch (e) {
                toast({ title: "Merge failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
              } finally {
                setBusy(false);
              }
            }} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-primary/50 hover:bg-accent/50">
              <div>
                <div className="text-[13.5px] font-bold tnum">{o.orderNo}</div>
                <div className="text-[11.5px] text-muted-foreground">{o.tableNumber ? `Table ${o.tableNumber}` : ORDER_TYPE_LABEL[o.type]} · {o.items.length} items</div>
              </div>
              <Money paise={o.totalPaise} className="font-bold" />
            </button>
          ))}
          {others.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No other active orders to merge with.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewTableDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("Indoor");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Add table</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <SectionLabel className="mb-1">Number</SectionLabel>
              <Input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} className="tnum h-11 rounded-xl" />
            </div>
            <div>
              <SectionLabel className="mb-1">Seats</SectionLabel>
              <Input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} className="tnum h-11 rounded-xl" />
            </div>
          </div>
          <div>
            <SectionLabel className="mb-1">Zone</SectionLabel>
            <div className="flex gap-1.5">
              {["Indoor", "Terrace", "Private Dining"].map((z) => (
                <button key={z} onClick={() => setZone(z)} className={cn("flex-1 rounded-xl border py-2 text-[12.5px] font-semibold", zone === z ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:bg-secondary")}>
                  {z}
                </button>
              ))}
            </div>
          </div>
          <Button className="h-11 w-full rounded-xl" disabled={!number || busy} onClick={async () => {
            setBusy(true);
            try {
              await post("/api/tables", { number: Number(number), seats: Number(seats) || 4, zone });
              toast({ title: `Table ${number} added` });
              onDone();
            } catch (e) {
              toast({ title: "Could not add", description: e instanceof Error ? e.message : "", variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add table
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReservationDialog({ table, onClose, onDone }: { table: TableDTO | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [count, setCount] = useState("2");
  const [when, setWhen] = useState(() => new Date(Date.now() + 3600e3).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  if (!table) return null;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Reserve Table {table.number}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" className="h-11 rounded-xl" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone (optional)" className="tnum h-11 rounded-xl" />
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} placeholder="Guests" className="tnum h-11 rounded-xl" />
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <Button className="h-11 w-full rounded-xl" disabled={!name.trim() || busy} onClick={async () => {
            setBusy(true);
            try {
              await post("/api/tables", { kind: "reservation", tableId: table.id, guestName: name.trim(), phone, guestCount: Number(count) || 2, at: new Date(when).toISOString() });
              toast({ title: "Reservation booked", description: `${name.trim()} · Table ${table.number}` });
              onDone();
            } catch (e) {
              toast({ title: "Could not book", description: e instanceof Error ? e.message : "", variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm reservation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
