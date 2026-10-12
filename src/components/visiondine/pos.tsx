/* POS Terminal — categories rail · menu grid · live cart · KOT · checkout */
"use client";
import { useMemo, useState } from "react";
import { api, post, patch, usePolling } from "@/lib/api";
import { useVision } from "@/lib/store";
import { computeBill, inr, lineDisplayName, ORDER_TYPE_LABEL } from "@/lib/money";
import type { MenuPayload, MenuItemDTO, OrderDTO, TableDTO, SettingsDTO } from "@/lib/types";
import { Logo, Money, StatusPill, VegMark, SectionLabel, PinDialog, EmptyState } from "@/components/visiondine/ui-bits";
import { ReceiptModal } from "@/components/visiondine/receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  Search, Plus, Minus, Trash2, StickyNote, PauseCircle, PlayCircle, Tag, X,
  Banknote, Smartphone, CreditCard, Loader2, ShoppingBag, Armchair, Bike, Layers, Send, HandPlatter,
} from "lucide-react";

export default function PosView() {
  const st = useVision();
  const { data: menu, loading: menuLoading } = usePolling<MenuPayload>("/api/menu");
  const { data: tables, refresh: refreshTables } = usePolling<TableDTO[]>("/api/tables", 10000);
  const { data: settings } = usePolling<SettingsDTO>("/api/settings");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [kotBusy, setKotBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [pickItem, setPickItem] = useState<MenuItemDTO | null>(null);

  const tax = settings?.tax || { gstPercent: 5, taxInclusive: true, serviceChargePercent: 0 };
  const bill = useMemo(
    () => computeBill(st.cart.map((l) => ({ qty: l.qty, unitPricePaise: l.unitPricePaise + l.addons.reduce((s, a) => s + a.pricePaise, 0) })), st.discount, tax),
    [st.cart, st.discount, tax],
  );

  const filtered = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.items.filter((m) => (cat === "all" || m.categoryId === cat) && (!q || m.name.toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q)));
  }, [menu, query, cat]);

  function addItem(m: MenuItemDTO, opts?: { variantName?: string | null; addons?: { name: string; pricePaise: number }[] }) {
    const variant = m.variants.find((v) => v.name === opts?.variantName);
    const addons = opts?.addons || [];
    const key = [m.id, variant?.name || "-", addons.map((a) => a.name).sort().join(",")].join("|");
    st.addToCart({
      key, menuItemId: m.id, name: m.name, variantName: variant?.name || null,
      unitPricePaise: m.pricePaise + (variant?.priceDeltaPaise || 0), addons, qty: 1, station: m.station,
    });
  }

  function onItemTap(m: MenuItemDTO) {
    if (!m.available || m.soldOut) return;
    if (m.variants.filter((v) => v.available).length || m.addons.filter((a) => a.available).length) setPickItem(m);
    else addItem(m);
  }

  const openTableOrder = tables?.find((t) => t.id === st.tableId);

  async function sendKOT() {
    if (!st.cart.length) return;
    if (st.orderType === "DINE_IN" && !st.tableId) {
      toast({ title: "Select a table first", variant: "destructive" });
      return;
    }
    setKotBusy(true);
    try {
      const order = await post<OrderDTO>("/api/orders", {
        type: st.orderType,
        tableId: st.tableId,
        guestCount: st.guestCount,
        customerName: st.customerName || undefined,
        items: st.cart.map((l) => ({
          menuItemId: l.menuItemId, qty: l.qty, variantName: l.variantName,
          addons: l.addons.map((a) => ({ name: a.name, pricePaise: a.pricePaise })), notes: l.notes,
        })),
      });
      if (st.couponCode) await applyCouponQuiet(order.id, st.couponCode);
      toast({ title: `${order.orderNo} sent to kitchen`, description: "Track it under Orders or the Kitchen Display." });
      st.clearCart();
      refreshTables();
    } catch (e) {
      toast({ title: "Could not send order", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setKotBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col xl:flex-row">
      {/* ── Menu area ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
          <div className="relative min-w-[180px] flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes…" className="h-10 rounded-xl border-input bg-card pl-9" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
            {[{ t: "DINE_IN", icon: Armchair }, { t: "TAKEAWAY", icon: ShoppingBag }, { t: "DELIVERY", icon: Bike }].map(({ t, icon: Icon }) => (
              <button
                key={t}
                onClick={() => st.setOrderType(t)}
                className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all", st.orderType === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}
              >
                <Icon className="h-3.5 w-3.5" /> {ORDER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          {st.orderType === "DINE_IN" && <TablePicker tables={tables || []} value={st.tableId} onSelect={(id, no) => st.setTable(id, no)} />}
          <button onClick={() => setHeldOpen(true)} className="relative ml-auto flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-secondary">
            <PauseCircle className="h-4 w-4" /> Held
            {st.held.length > 0 && <span className="tnum flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{st.held.length}</span>}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="no-scrollbar w-[104px] shrink-0 overflow-y-auto border-r bg-card/40 py-3 sm:w-[128px]">
            <button
              onClick={() => setCat("all")}
              className={cn("mx-2 mb-1 flex w-[calc(100%-16px)] flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[12px] font-semibold transition-all", cat === "all" ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}
            >
              <Layers className="h-4 w-4" /> All
            </button>
            {menu?.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={cn("mx-2 mb-1 line-clamp-2 w-[calc(100%-16px)] rounded-xl px-2 py-2.5 text-center text-[12px] font-semibold leading-tight transition-all", cat === c.id ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}
              >
                {c.name}
              </button>
            ))}
          </div>
          <ScrollArea className="min-w-0 flex-1">
            <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 2xl:grid-cols-4">
              {menuLoading && [...Array(8)].map((_, i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-secondary" />)}
              {filtered.map((m) => {
                const off = !m.available || m.soldOut;
                return (
                  <button
                    key={m.id}
                    onClick={() => onItemTap(m)}
                    disabled={off}
                    className={cn("group relative flex flex-col rounded-2xl border bg-card p-3 text-left shadow-soft transition-all", off ? "cursor-not-allowed opacity-55" : "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lift active:scale-[0.98]")}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <VegMark diet={m.diet} />
                      {m.soldOut ? <StatusPill tone="red" dot={false}>Sold out</StatusPill> : !m.available ? <StatusPill tone="gray" dot={false}>Off menu</StatusPill> : null}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug">{m.name}</div>
                    <div className="mt-auto flex items-center justify-between pt-1.5">
                      <Money paise={m.pricePaise} compact className="text-[13.5px] font-bold text-primary" />
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-all", off ? "bg-secondary text-muted-foreground" : "bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground")}>
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                    {(m.variants.length > 0 || m.addons.length > 0) && !off && (
                      <span className="absolute right-2.5 top-2.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9.5px] font-bold text-muted-foreground">
                        {m.variants.length + m.addons.length}
                      </span>
                    )}
                  </button>
                );
              })}
              {!menuLoading && filtered.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon={<Search className="h-5 w-5" />} title="No dishes match" hint="Try a different search or category." />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Cart panel ── */}
      <aside className="flex w-full shrink-0 flex-col border-t bg-card xl:w-[380px] xl:border-l xl:border-t-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <SectionLabel>Current order</SectionLabel>
            <div className="font-display text-[15px] font-bold tracking-tight">
              {st.orderType === "DINE_IN" ? (st.tableNumber ? `Table ${st.tableNumber}` : "Select table") : ORDER_TYPE_LABEL[st.orderType]}
              {openTableOrder?.openOrderNo && <span className="ml-2 text-[11px] font-semibold text-muted-foreground tnum">joins {openTableOrder.openOrderNo}</span>}
            </div>
          </div>
          {st.cart.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => st.clearCart()}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {st.cart.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="h-5 w-5" />} title="Cart is empty" hint="Tap dishes to build the order. Hold keeps it parked on this terminal." />
          ) : (
            <div className="space-y-2 p-3">
              {st.cart.map((l) => {
                const addonsTotal = l.addons.reduce((s, a) => s + a.pricePaise, 0);
                return (
                  <div key={l.key} className="rounded-xl border bg-background/60 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold leading-snug">{lineDisplayName(l.name, l.variantName)}</div>
                        <Money paise={l.unitPricePaise} className="text-xs text-muted-foreground" />
                        {addonsTotal > 0 && <div className="text-[11px] text-gold">+ {l.addons.map((a) => a.name).join(", ")}</div>}
                        {l.notes && <div className="mt-0.5 flex items-start gap-1 text-[11.5px] italic text-amber-700"><StickyNote className="mt-0.5 h-3 w-3 shrink-0" />{l.notes}</div>}
                      </div>
                      <Money paise={(l.unitPricePaise + addonsTotal) * l.qty} className="shrink-0 text-[14px] font-bold" />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => st.setQty(l.key, l.qty - 1)} aria-label="Decrease">
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="tnum w-8 text-center text-[14px] font-bold">{l.qty}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => st.setQty(l.key, l.qty + 1)} aria-label="Increase">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <button
                        onClick={() => setNoteFor(l.key)}
                        className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold", l.notes ? "border-amber-300 bg-amber-50 text-amber-700" : "text-muted-foreground hover:bg-secondary")}
                      >
                        <StickyNote className="h-3 w-3" /> Note
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-3">
          <div className="space-y-1 text-[13px]">
            <Row k="Subtotal" v={bill.subtotalPaise} />
            {bill.discountPaise > 0 && <Row k={`Discount${st.discountReason ? ` · ${st.discountReason.split("·")[0].trim()}` : ""}`} v={-bill.discountPaise} tone="text-emerald-600" />}
            <Row k={`GST ${tax.gstPercent}%${tax.taxInclusive ? " (incl.)" : ""}`} v={bill.taxPaise} muted />
            {bill.servicePaise > 0 && <Row k={`Service ${tax.serviceChargePercent}%`} v={bill.servicePaise} muted />}
            <div className="flex items-center justify-between pt-1.5">
              <span className="font-display text-[15px] font-bold">Total</span>
              <Money paise={bill.totalPaise} className="font-display text-[20px] font-extrabold text-primary" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!st.cart.length || kotBusy} className="h-11 rounded-xl gap-1.5" onClick={sendKOT}>
              {kotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send KOT
            </Button>
            <Button
              disabled={!st.cart.length || (st.orderType === "DINE_IN" && !st.tableId && !openTableOrder?.openOrderId)}
              className="h-11 rounded-xl bg-primary font-display text-[15px] font-bold shadow-soft hover:bg-primary/90"
              onClick={() => (st.tableId && openTableOrder?.openOrderId ? sendToExisting(openTableOrder.openOrderId) : setCheckoutOpen(true))}
            >
              {st.tableId && openTableOrder?.openOrderId ? (<>Add to {openTableOrder.openOrderNo}</>) : (<>Charge <Money paise={bill.totalPaise} className="ml-1 font-display font-extrabold" /></>)}
            </Button>
          </div>
          <DiscountTrigger />
        </div>
      </aside>

      {/* Held orders */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Held orders</DialogTitle>
          </DialogHeader>
          {st.held.length === 0 ? (
            <EmptyState icon={<PauseCircle className="h-5 w-5" />} title="Nothing parked" hint="Hold an in-progress order to free the terminal for the next guest." />
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {st.held.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="text-[13.5px] font-semibold">{h.label}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {ORDER_TYPE_LABEL[h.orderType]} · parked {new Date(h.heldAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-8 gap-1 rounded-lg" onClick={() => { st.resumeHeld(h.id); setHeldOpen(false); }}>
                      <PlayCircle className="h-3.5 w-3.5" /> Resume
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => st.dropHeld(h.id)} aria-label="Discard">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ItemPicker item={pickItem} onClose={() => setPickItem(null)} onAdd={addItem} />
      <NoteDialog lineKey={noteFor} onClose={() => setNoteFor(null)} />
      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} bill={bill} onPaid={(id) => { setCheckoutOpen(false); setReceiptId(id); st.clearCart(); refreshTables(); }} />
      <DiscountDialog />
      <ReceiptModal orderId={receiptId} open={!!receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );

  async function sendToExisting(orderId: string) {
    try {
      await patch("/api/orders", {
        orderId,
        action: "add-items",
        items: st.cart.map((l) => ({
          menuItemId: l.menuItemId, qty: l.qty, variantName: l.variantName,
          addons: l.addons.map((a) => ({ name: a.name, pricePaise: a.pricePaise })), notes: l.notes,
        })),
      });
      toast({ title: "Items sent to kitchen", description: "Added to the table's running order." });
      st.clearCart();
    } catch (e) {
      toast({ title: "Could not add items", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }
}

function Row({ k, v, muted, tone }: { k: string; v: number; muted?: boolean; tone?: string }) {
  return (
    <div className={cn("flex items-center justify-between", muted && "text-muted-foreground")}>
      <span>{k}</span>
      <Money paise={v} className={cn("font-semibold", tone)} />
    </div>
  );
}

function TablePicker({ tables, value, onSelect }: { tables: TableDTO[]; value: string | null; onSelect: (id: string | null, no: number | null) => void }) {
  const available = tables.filter((t) => t.status !== "INACTIVE");
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border bg-card p-1 no-scrollbar">
      <button onClick={() => onSelect(null, null)} className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold", !value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>
        —
      </button>
      {available.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id, t.number)}
          title={t.status === "OCCUPIED" ? `Table ${t.number} — items will join its running order` : `Table ${t.number} · ${t.seats} seats`}
          className={cn(
            "tnum relative shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors",
            value === t.id ? "bg-primary text-primary-foreground shadow-soft" : t.status === "OCCUPIED" ? "bg-amber-100 text-amber-800" : "text-foreground hover:bg-secondary",
          )}
        >
          {t.number}
        </button>
      ))}
    </div>
  );
}

/* ---------- variant/addon picker ---------- */
function ItemPicker({ item, onClose, onAdd }: { item: MenuItemDTO | null; onClose: () => void; onAdd: (m: MenuItemDTO, o: { variantName?: string | null; addons?: { name: string; pricePaise: number }[] }) => void }) {
  const [variant, setVariant] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [shownItem, setShownItem] = useState<MenuItemDTO | null>(null);
  if (item && shownItem?.id !== item.id) {
    setShownItem(item);
    setVariant(item.variants.find((v) => v.available)?.name || null);
    setAddons([]);
  }
  if (!item || !shownItem) return null;
  const m = shownItem;
  const v = m.variants.find((x) => x.name === variant);
  const chosen = m.addons.filter((a) => addons.includes(a.name));
  const unit = m.pricePaise + (v?.priceDeltaPaise || 0) + chosen.reduce((s, a) => s + a.pricePaise, 0);

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><VegMark diet={m.diet} /> {m.name}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-[13px] text-muted-foreground">{m.description}</p>
        {m.allergens && <p className="-mt-2 text-[11.5px] font-semibold text-amber-700">Allergens: {m.allergens}</p>}
        {m.variants.filter((x) => x.available).length > 0 && (
          <div>
            <SectionLabel className="mb-1.5">Portion</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {m.variants.filter((x) => x.available).map((x) => (
                <button key={x.id} onClick={() => setVariant(x.name)} className={cn("rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-all", variant === x.name ? "border-primary bg-accent text-primary" : "hover:bg-secondary")}>
                  {x.name} <span className="tnum text-[11px] text-muted-foreground">{x.priceDeltaPaise === 0 ? "" : x.priceDeltaPaise > 0 ? `+${inr(x.priceDeltaPaise)}` : `-${inr(-x.priceDeltaPaise)}`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {m.addons.filter((x) => x.available).length > 0 && (
          <div>
            <SectionLabel className="mb-1.5">Extras</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {m.addons.filter((x) => x.available).map((x) => (
                <button key={x.id} onClick={() => setAddons((s) => (s.includes(x.name) ? s.filter((n) => n !== x.name) : [...s, x.name]))} className={cn("rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-all", addons.includes(x.name) ? "border-primary bg-accent text-primary" : "hover:bg-secondary")}>
                  {x.name} <span className="tnum text-[11px] text-muted-foreground">+{inr(x.pricePaise)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Button className="h-11 rounded-xl font-display text-[15px] font-bold" onClick={() => { onAdd(m, { variantName: variant, addons: chosen.map((c) => ({ name: c.name, pricePaise: c.pricePaise })) }); onClose(); }}>
          Add · <Money paise={unit} className="font-display font-extrabold" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- per-line kitchen note ---------- */
function NoteDialog({ lineKey, onClose }: { lineKey: string | null; onClose: () => void }) {
  const cart = useVision((s) => s.cart);
  const line = cart.find((l) => l.key === lineKey);
  const [text, setText] = useState(line?.notes || "");
  if (!lineKey || !line) return null;
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Kitchen note · {line.name}</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Less spicy, no onion" className="h-11 rounded-xl" />
        <div className="flex flex-wrap gap-1.5">
          {["Less spicy", "No onion / garlic", "Jain", "Extra crispy", "Serve first"].map((q) => (
            <button key={q} onClick={() => setText(q)} className="rounded-full border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
              {q}
            </button>
          ))}
        </div>
        <Button className="h-10 rounded-xl" onClick={() => { useVision.setState((s) => ({ cart: s.cart.map((x) => (x.key === lineKey ? { ...x, notes: text.trim() || undefined } : x)) })); onClose(); }}>
          Save note
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- discount / coupon (global dialog driven by store flag) ---------- */
function DiscountTrigger() {
  const discount = useVision((s) => s.discount);
  const coupon = useVision((s) => s.couponCode);
  const cartLen = useVision((s) => s.cart.length);
  return (
    <button
      onClick={() => useVision.setState({ discountDialogOpen: true })}
      disabled={!cartLen}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
    >
      <Tag className="h-3.5 w-3.5" />
      {discount || coupon ? `Applied: ${coupon ? `coupon ${coupon}` : "manual discount"} — change` : "Apply discount / coupon"}
    </button>
  );
}

function DiscountDialog() {
  const open = useVision((s) => s.discountDialogOpen);
  const auth = useVision((s) => s.auth);
  const [mode, setMode] = useState<"coupon" | "manual">("coupon");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);

  function close() {
    useVision.setState({ discountDialogOpen: false });
  }
  function applyManual() {
    const v = kind === "PERCENT" ? Math.round(Number(value)) : Math.round(Number(value) * 100);
    if (!v || v <= 0) {
      toast({ title: "Enter a discount value", variant: "destructive" });
      return;
    }
    if (kind === "PERCENT" && v > 100) {
      toast({ title: "Percent cannot exceed 100", variant: "destructive" });
      return;
    }
    useVision.getState().setDiscount({ kind, value: v }, `${reason.trim() || "Manual"} · by ${auth?.name || "staff"}`);
    toast({ title: "Discount applied", description: "Recorded against the order when it is placed." });
    close();
  }

  return (
    <>
      <Dialog open={!!open} onOpenChange={(v) => (!v ? close() : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Discounts</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1 rounded-xl border bg-secondary/60 p-1">
            {(["coupon", "manual"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold capitalize", mode === m ? "bg-card shadow-soft" : "text-muted-foreground")}>
                {m === "coupon" ? "Coupon code" : "Manual discount"}
              </button>
            ))}
          </div>
          {mode === "coupon" ? (
            <div className="space-y-2.5">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className="h-11 rounded-xl text-center font-bold tracking-widest" />
              <Button className="h-11 w-full rounded-xl" disabled={!code.trim()} onClick={() => { useVision.getState().setCoupon(code.trim()); toast({ title: `Coupon ${code.trim()} attached`, description: "Validated server-side when the order is placed." }); close(); }}>
                Attach coupon
              </Button>
              <p className="text-center text-[11.5px] text-muted-foreground">Try WELCOME10 (10% off over ₹500) or FLAT50 (₹50 off over ₹300)</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex gap-1 rounded-xl border bg-secondary/60 p-1">
                {(["PERCENT", "FLAT"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={cn("flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold", kind === k ? "bg-card shadow-soft" : "text-muted-foreground")}>
                    {k === "PERCENT" ? "Percent %" : "Flat ₹"}
                  </button>
                ))}
              </div>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder={kind === "PERCENT" ? "e.g. 10" : "e.g. 100"} className="h-11 rounded-xl tnum" />
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="h-11 rounded-xl" />
              <Button className="h-11 w-full rounded-xl" disabled={!value || !reason.trim()} onClick={() => (auth && !["OWNER", "MANAGER"].includes(auth.role) ? setPinOpen(true) : applyManual())}>
                {auth && !["OWNER", "MANAGER"].includes(auth.role) ? "Authorize with manager PIN" : "Apply discount"}
              </Button>
            </div>
          )}
          {(useVision.getState().discount || useVision.getState().couponCode) && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => { useVision.setState({ discount: null, discountReason: "", couponCode: "" }); close(); }}>
              Remove applied discount
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <PinDialog
        open={pinOpen}
        title="Manager authorization"
        description="Manual discounts need a manager PIN."
        onClose={() => setPinOpen(false)}
        onSubmit={async (pin) => {
          try {
            const res = await post<{ valid: boolean }>("/api/auth", { action: "verify-manager", pin });
            if (!res.valid) throw new Error("bad pin");
            setPinOpen(false);
            applyManual();
          } catch {
            toast({ title: "Invalid manager PIN", variant: "destructive" });
          }
        }}
      />
    </>
  );
}

async function applyCouponQuiet(orderId: string, code: string) {
  await patch("/api/orders", { orderId, action: "apply-coupon", code });
}

/* ---------- checkout & payment ---------- */
type PayLine = { method: string; amountPaise: number; reference?: string };

function CheckoutDialog({ open, onClose, bill, onPaid }: { open: boolean; onClose: () => void; bill: ReturnType<typeof computeBill>; onPaid: (orderId: string) => void }) {
  const st = useVision();
  const auth = useVision((s) => s.auth);
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "SPLIT">("CASH");
  const [tendered, setTendered] = useState("");
  const [upiRef, setUpiRef] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [split, setSplit] = useState<PayLine[]>([{ method: "CASH", amountPaise: 0 }, { method: "UPI", amountPaise: 0 }]);
  const [busy, setBusy] = useState(false);
  const [kotBusy, setKotBusy] = useState(false);

  if (!open) return null;
  const total = bill.totalPaise;
  const tenderedPaise = Math.round(Number(tendered || 0) * 100);
  const change = method === "CASH" ? tenderedPaise - total : 0;
  const splitTotal = split.reduce((s, l) => s + (l.amountPaise || 0), 0);

  function payLines(): PayLine[] {
    if (method === "CASH") return [{ method: "CASH", amountPaise: total }];
    if (method === "UPI") return [{ method: "UPI", amountPaise: total, reference: upiRef.trim() || undefined }];
    if (method === "CARD") return [{ method: "CARD", amountPaise: total, reference: cardRef.trim() || undefined }];
    return split.filter((l) => l.amountPaise > 0).map((l) => ({ ...l }));
  }

  async function settle() {
    const lines = payLines();
    const sum = lines.reduce((s, l) => s + l.amountPaise, 0);
    if (sum !== total) {
      toast({ title: "Amount mismatch", description: `Split must add up to ${inr(total)}`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // 1. create the order (server re-prices everything from stored menu prices)
      const order = await post<OrderDTO>("/api/orders", {
        type: st.orderType,
        tableId: st.tableId,
        guestCount: st.guestCount,
        customerName: st.customerName || undefined,
        items: st.cart.map((l) => ({
          menuItemId: l.menuItemId, qty: l.qty, variantName: l.variantName,
          addons: l.addons.map((a) => ({ name: a.name, pricePaise: a.pricePaise })), notes: l.notes,
        })),
      });
      // 2. attach discount / coupon (server-validated)
      if (st.discount) {
        await patch("/api/orders", {
          orderId: order.id, action: "discount",
          kind: st.discount.kind, value: st.discount.value,
          reason: st.discountReason || "Manual discount",
          managerPin: auth && ["OWNER", "MANAGER"].includes(auth.role) ? undefined : undefined,
        });
      }
      if (st.couponCode) await applyCouponQuiet(order.id, st.couponCode);
      // 3. settle payment — idempotency key guards double submits
      await post(`/api/orders/${order.id}/pay`, { payments: lines, idempotencyKey: crypto.randomUUID() });
      toast({ title: `${order.orderNo} settled`, description: `${inr(total)} received · receipt ready.` });
      onPaid(order.id);
    } catch (e) {
      toast({ title: "Payment failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function kotThenClose() {
    setKotBusy(true);
    try {
      const order = await post<OrderDTO>("/api/orders", {
        type: st.orderType, tableId: st.tableId, guestCount: st.guestCount, customerName: st.customerName || undefined,
        items: st.cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, variantName: l.variantName, addons: l.addons.map((a) => ({ name: a.name, pricePaise: a.pricePaise })), notes: l.notes })),
      });
      if (st.couponCode) await applyCouponQuiet(order.id, st.couponCode);
      toast({ title: `${order.orderNo} sent to kitchen`, description: "Payment pending — settle from Tables or Orders." });
      onClose();
      st.clearCart();
    } catch (e) {
      toast({ title: "Could not place order", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setKotBusy(false);
    }
  }

  const upiString = `upi://pay?pa=demo@visiondineupi&pn=VisionDine&am=${(total / 100).toFixed(2)}&cu=INR&tn=VisionDine%20bill`;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Take payment</DialogTitle>
        </DialogHeader>
        <div className="rounded-2xl bg-accent/60 p-4 text-center">
          <div className="section-label">Amount due</div>
          <div className="tnum font-display text-[34px] font-extrabold leading-tight text-primary">{inr(total)}</div>
          {bill.discountPaise > 0 && <div className="text-xs text-muted-foreground">includes {inr(bill.discountPaise)} discount</div>}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { m: "CASH" as const, icon: Banknote, label: "Cash" },
            { m: "UPI" as const, icon: Smartphone, label: "UPI" },
            { m: "CARD" as const, icon: CreditCard, label: "Card" },
            { m: "SPLIT" as const, icon: Layers, label: "Split" },
          ].map(({ m, icon: Icon, label }) => (
            <button key={m} onClick={() => setMethod(m)} className={cn("flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[12px] font-semibold transition-all", method === m ? "border-primary bg-accent text-primary shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              <Icon className="h-4.5 w-4.5" /> {label}
            </button>
          ))}
        </div>

        {method === "CASH" && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              {[500, 1000, 2000].map((v) => (
                <button key={v} onClick={() => setTendered(String(v))} className="tnum flex-1 rounded-xl border py-2 text-[13px] font-bold hover:bg-secondary">₹{v}</button>
              ))}
              <button onClick={() => setTendered((total / 100).toFixed(2))} className="flex-1 rounded-xl border py-2 text-[13px] font-bold hover:bg-secondary">Exact</button>
            </div>
            <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Cash received (₹)" className="h-11 rounded-xl tnum text-center text-lg font-bold" />
            <div className={cn("rounded-xl px-3 py-2 text-center text-[13px] font-semibold", change < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
              {change < 0 ? `Short by ${inr(-change)}` : `Change due ${inr(change)}`}
            </div>
          </div>
        )}

        {method === "UPI" && (
          <div className="flex items-center gap-4">
            <div className="rounded-xl border bg-white p-2.5">
              <QRCodeSVG value={upiString} size={92} fgColor="#1c1917" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[12px] leading-relaxed text-muted-foreground">Guest scans and pays <strong className="tnum">{inr(total)}</strong>. Confirm the credit in your UPI app before marking received.</p>
              <Input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="UTR / reference (optional)" className="h-9 rounded-lg text-[13px]" />
            </div>
          </div>
        )}

        {method === "CARD" && (
          <Input value={cardRef} onChange={(e) => setCardRef(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} placeholder="Last 4 digits of card" className="h-11 rounded-xl tnum text-center tracking-[0.4em]" />
        )}

        {method === "SPLIT" && (
          <div className="space-y-2">
            {split.map((l, i) => {
              const other = splitTotal - (l.amountPaise || 0);
              return (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.method}
                    onChange={(e) => setSplit((s) => s.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}
                    className="h-10 rounded-xl border bg-card px-2 text-[13px] font-semibold"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                  <Input
                    inputMode="decimal" value={l.amountPaise ? (l.amountPaise / 100).toFixed(2) : ""}
                    onChange={(e) => setSplit((s) => s.map((x, j) => (j === i ? { ...x, amountPaise: Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100) || 0 } : x)))}
                    placeholder="₹ amount" className="h-10 flex-1 rounded-xl tnum"
                  />
                  <button onClick={() => setSplit((s) => s.map((x, j) => (j === i ? { ...x, amountPaise: Math.max(0, total - other) } : x)))} className="rounded-lg border px-2 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-secondary">
                    Rest
                  </button>
                </div>
              );
            })}
            <div className={cn("rounded-xl px-3 py-2 text-center text-[13px] font-semibold", splitTotal === total ? "bg-emerald-50 text-emerald-700" : "bg-secondary text-muted-foreground")}>
              {splitTotal === total ? "Fully covered" : `Remaining ${inr(total - splitTotal)}`}
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
          <Button className="h-12 rounded-xl bg-primary font-display text-[15px] font-bold shadow-soft hover:bg-primary/90" disabled={busy || (method === "SPLIT" && splitTotal !== total)} onClick={settle}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Processing…" : `Mark received · ${inr(total)}`}
          </Button>
          <Button variant="outline" className="h-12 rounded-xl gap-1.5" disabled={kotBusy} onClick={kotThenClose} title="Place order and settle later">
            {kotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandPlatter className="h-4 w-4" />} KOT only
          </Button>
        </div>
        <p className="-mt-1 text-center text-[11px] text-muted-foreground">Double-charging is prevented — payments are idempotent.</p>
      </DialogContent>
    </Dialog>
  );
}
