/* Customer QR menu — table ordering, no login. Public face of VisionDine. */
"use client";
import { useMemo, useState } from "react";
import { api, post, usePolling } from "@/lib/api";
import { inr } from "@/lib/money";
import { Logo, VegMark } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Search, ShoppingBag, Trash2, Plus, Minus, StickyNote, Loader2, Phone, CheckCircle2, ChefHat, BellRing, Clock, Sparkles } from "lucide-react";

type PublicItem = {
  id: string; name: string; description: string | null; pricePaise: number; categoryId: string;
  diet: string; allergens: string | null; soldOut: boolean; prepMinutes: number;
  variants: { name: string; priceDeltaPaise: number }[]; addons: { name: string; pricePaise: number }[];
};

type PublicMenu = {
  table: { id: string; number: number; zone: string } | null;
  profile: { name?: string };
  menu: { categories: { id: string; name: string }[]; items: PublicItem[] };
};

type CartLine = { menuItemId: string; name: string; variantName?: string; unitPricePaise: number; qty: number; addons: { name: string }[]; notes?: string };

export default function CustomerMenuView({ tableNo, onTrack }: { tableNo: number | null; onTrack: (orderNo: string) => void }) {
  const url = tableNo ? `/api/public?table=${tableNo}` : "/api/public";
  const { data, loading, error } = usePolling<PublicMenu>(url, 60000);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<PublicMenu["items"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const items = useMemo(() => {
    if (!data) return [];
    return data.menu.items.filter((m) => (cat === "all" || m.categoryId === cat) && (!q || m.name.toLowerCase().includes(q.toLowerCase())));
  }, [data, cat, q]);

  const total = cart.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  function addToCart(m: PublicMenu["items"][number], variantName?: string, addons?: { name: string }[], note?: string) {
    const v = m.variants.find((x) => x.name === variantName);
    const unit = m.pricePaise + (v?.priceDeltaPaise || 0);
    const key = `${m.id}|${variantName || ""}|${(addons || []).map((a) => a.name).sort().join(",")}`;
    setCart((c) => {
      const ex = c.findIndex((l) => `${l.menuItemId}|${l.variantName || ""}|${l.addons.map((a) => a.name).sort().join(",")}` === key);
      if (ex >= 0) {
        const next = [...c];
        next[ex] = { ...next[ex], qty: next[ex].qty + 1 };
        return next;
      }
      return [...c, { menuItemId: m.id, name: m.name, variantName, unitPricePaise: unit, qty: 1, addons: addons || [], notes: note }];
    });
    toast({ title: `${m.name} added`, description: inr(unit) });
  }

  async function placeOrder() {
    if (!data?.table) return;
    setBusy(true);
    try {
      const res = await post<{ orderNo: string }>("/api/public", {
        tableNumber: data.table.number,
        customerName: name.trim() || undefined,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, variantName: l.variantName, addons: l.addons, notes: l.notes })),
      });
      setCart([]);
      setCartOpen(false);
      onTrack(res.orderNo);
    } catch (e) {
      toast({ title: "Order failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Center>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500"><ShoppingBag className="h-5 w-5" /></div>
          <div className="font-display text-[17px] font-bold">{error}</div>
          <p className="mt-1 text-[13px] text-muted-foreground">Please scan the QR on your table again, ya staff se pooch lein.</p>
        </div>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* header */}
      <header className="sticky top-0 z-30 border-b bg-card/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size={28} />
          {data?.table && (
            <span className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-primary">
              Table {data.table.number} · {data.table.zone}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4">
        <div className="py-4">
          <h1 className="font-display text-[22px] font-extrabold tracking-tight">
            {data?.profile?.name || "Menu"}
          </h1>
          <p className="text-[13px] text-muted-foreground">Order directly from your table — khana aapki table par serve hoga.</p>
        </div>

        <div className="sticky top-[57px] z-20 -mx-4 bg-background/90 px-4 pb-3 pt-1 backdrop-blur">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu…" className="h-11 rounded-2xl bg-card pl-9" />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>All</Chip>
            {data?.menu.categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>
            ))}
          </div>
        </div>

        {loading && <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />)}</div>}
        <div className="space-y-2">
          {items.map((m) => (
            <button key={m.id} onClick={() => !m.soldOut && setDetail(m)} className={cn("flex w-full items-start justify-between gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-soft transition-all", m.soldOut ? "opacity-55" : "active:scale-[0.99] hover:border-primary/30")}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <VegMark diet={m.diet} />
                  <span className="text-[14px] font-bold">{m.name}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{m.description}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[14px] font-extrabold text-primary tnum">{inr(m.pricePaise, { compact: true })}</span>
                  {m.prepMinutes && <span className="flex items-center gap-0.5 text-[10.5px] text-muted-foreground"><Clock className="h-3 w-3" />{m.prepMinutes} min</span>}
                  {m.allergens && <span className="text-[10.5px] text-amber-700">{m.allergens}</span>}
                </div>
              </div>
              {m.soldOut ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10.5px] font-bold text-red-600">Sold out</span>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Plus className="h-4.5 w-4.5" /></span>
              )}
            </button>
          ))}
          {!loading && items.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">Koi dish match nahi hui.</p>}
        </div>
      </main>

      {/* floating cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto max-w-xl px-4">
          <button onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lift transition-transform active:scale-[0.99]">
            <span className="flex items-center gap-2 text-[14px] font-bold">
              <ShoppingBag className="h-4.5 w-4.5" /> {count} item{count > 1 ? "s" : ""} · {inr(total)}
            </span>
            <span className="text-[14px] font-extrabold">View cart →</span>
          </button>
        </div>
      )}

      {/* item detail */}
      <ItemDetail item={detail} onClose={() => setDetail(null)} onAdd={addToCart} />
      {/* cart sheet */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md rounded-t-3xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Your order{data?.table ? ` · Table ${data.table.number}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[40vh] space-y-2 overflow-y-auto">
            {cart.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{l.name}{l.variantName ? ` (${l.variantName})` : ""}</div>
                  <div className="text-[11.5px] text-muted-foreground tnum">{inr(l.unitPricePaise)}{l.notes ? ` · ${l.notes}` : ""}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))} className="flex h-7 w-7 items-center justify-center rounded-lg border"><Minus className="h-3 w-3" /></button>
                  <span className="tnum w-5 text-center text-[13px] font-bold">{l.qty}</span>
                  <button onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))} className="flex h-7 w-7 items-center justify-center rounded-lg border"><Plus className="h-3 w-3" /></button>
                  <button onClick={() => setCart((c) => c.filter((_, j) => j !== i))} className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="h-10 rounded-xl" />
          <Button className="h-12 w-full rounded-2xl font-display text-[15px] font-bold" disabled={busy || !data?.table} onClick={placeOrder}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Place order · {inr(total)}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Pay at the table or ask for the bill — <Phone className="inline h-3 w-3" /> staff ko call karne ke liye order status page use karein.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all", active ? "bg-primary text-primary-foreground shadow-soft" : "border bg-card text-muted-foreground")}>
      {children}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}

function ItemDetail({ item, onClose, onAdd }: { item: PublicMenu["items"][number] | null; onClose: () => void; onAdd: (m: PublicMenu["items"][number], v?: string, a?: { name: string }[], note?: string) => void }) {
  const [variant, setVariant] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if (item && shown !== item.id) {
    setShown(item.id);
    setVariant(item.variants[0]?.name || null);
    setAddons([]);
    setNote("");
  }
  if (!item) return null;
  const v = item.variants.find((x) => x.name === variant);
  const unit = item.pricePaise + (v?.priceDeltaPaise || 0);
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><VegMark diet={item.diet} /> {item.name}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-[13px] text-muted-foreground">{item.description}</p>
        {item.variants.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.variants.map((x) => (
              <button key={x.name} onClick={() => setVariant(x.name)} className={cn("rounded-xl border px-3 py-2 text-[12.5px] font-semibold", variant === x.name ? "border-primary bg-accent text-primary" : "")}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {item.addons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.addons.map((a) => (
              <button key={a.name} onClick={() => setAddons((s) => (s.includes(a.name) ? s.filter((n) => n !== a.name) : [...s, a.name]))} className={cn("rounded-xl border px-3 py-2 text-[12.5px] font-semibold", addons.includes(a.name) ? "border-primary bg-accent text-primary" : "")}>
                + {a.name} <span className="text-[11px] text-muted-foreground">{inr(a.pricePaise)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <StickyNote className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special instructions — less spicy…" className="h-10 rounded-xl pl-9 text-[13px]" />
        </div>
        <Button
          className="h-12 rounded-2xl font-display text-[15px] font-bold"
          onClick={() => {
            onAdd(item, variant || undefined, addons.map((n) => ({ name: n })), note.trim() || undefined);
            onClose();
          }}
        >
          Add to cart · <span className="tnum">{inr(unit)}</span>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
