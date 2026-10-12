/* Inventory — ingredients, purchases, wastage, adjustments, movement ledger */
"use client";
import { useMemo, useState } from "react";
import { patch, post, usePolling } from "@/lib/api";
import { inr } from "@/lib/money";
import type { IngredientDTO, MovementDTO } from "@/lib/types";
import { EmptyState, Money, SectionLabel, StatusPill } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowDownUp, PackagePlus, PackageMinus, Plus, Search, Warehouse } from "lucide-react";

type StockAction = { kind: "purchase" | "wastage" | "adjustment"; ingredient: IngredientDTO } | null;

export default function InventoryView() {
  const { data, loading, refresh } = usePolling<{ ingredients: IngredientDTO[]; movements: MovementDTO[] }>("/api/inventory?movements=100", 15000);
  const [tab, setTab] = useState<"stock" | "ledger">("stock");
  const [q, setQ] = useState("");
  const [action, setAction] = useState<StockAction>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newIng, setNewIng] = useState({ name: "", unit: "KG", qty: "", minQty: "", cost: "", supplier: "", location: "" });

  const ingredients = useMemo(() => (data?.ingredients || []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const lowCount = (data?.ingredients || []).filter((i) => i.qty <= i.minQty).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="flex rounded-xl border bg-card p-1">
          {(["stock", "ledger"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-[12.5px] font-semibold capitalize", tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              {t === "stock" ? "Ingredients" : "Stock ledger"}
            </button>
          ))}
        </div>
        {lowCount > 0 && <StatusPill tone="amber" pulse><AlertTriangle className="mr-1 h-3 w-3" />{lowCount} items below minimum</StatusPill>}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ingredients…" className="h-10 rounded-xl pl-9" />
        </div>
        <Button className="rounded-xl" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Ingredient
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-secondary" />)}</div>}

        {tab === "stock" && (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {ingredients.map((i) => {
              const low = i.qty <= i.minQty;
              const expSoon = i.expiresAt && new Date(i.expiresAt).getTime() < Date.now() + 3 * 864e5;
              return (
                <div key={i.id} className={cn("rounded-2xl border bg-card p-4 shadow-soft", low && "border-amber-300")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Warehouse className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-[14px] font-bold">{i.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        {i.supplier && <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{i.supplier}</span>}
                        {i.location && <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{i.location}</span>}
                        {expSoon && <StatusPill tone="amber" dot={false}>exp {new Date(i.expiresAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</StatusPill>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("tnum font-display text-[20px] font-extrabold", low ? "text-amber-600" : "text-foreground")}>
                        {i.qty % 1 === 0 ? i.qty : i.qty.toFixed(1)}
                        <span className="ml-1 text-[12px] font-bold text-muted-foreground">{i.unit}</span>
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">min {i.minQty} {i.unit}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full", low ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, (i.qty / Math.max(i.minQty * 2, i.qty, 1)) * 100)}%` }} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Cost <Money paise={i.costPerUnitPaise} className="font-semibold text-foreground" compact />/{i.unit}</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-[12px]" onClick={() => setAction({ kind: "purchase", ingredient: i })}>
                        <PackagePlus className="h-3.5 w-3.5" /> Purchase
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-[12px]" onClick={() => setAction({ kind: "wastage", ingredient: i })}>
                        <PackageMinus className="h-3.5 w-3.5" /> Wastage
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-[12px]" onClick={() => setAction({ kind: "adjustment", ingredient: i })}>
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && ingredients.length === 0 && <div className="col-span-full"><EmptyState icon={<Warehouse className="h-5 w-5" />} title="No ingredients" hint="Add ingredients to track stock and recipes." /></div>}
          </div>
        )}

        {tab === "ledger" && (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-secondary/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Ingredient</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {(data?.movements || []).map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground tnum">{new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5 font-semibold">{m.ingredientName}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={m.type === "PURCHASE" ? "green" : m.type === "WASTAGE" ? "red" : m.type === "SALE" ? "teal" : "gray"} dot={false}>{m.type}</StatusPill>
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-bold tnum", m.qtyDelta < 0 ? "text-red-600" : "text-emerald-600")}>
                      {m.qtyDelta > 0 ? "+" : ""}{m.qtyDelta % 1 === 0 ? m.qtyDelta : m.qtyDelta.toFixed(2)} {m.unit}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.orderRef || m.reason || "—"}{m.staffName ? ` · ${m.staffName.split(" ")[0]}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && (data?.movements || []).length === 0 && <EmptyState icon={<ArrowDownUp className="h-5 w-5" />} title="No movements yet" />}
          </div>
        )}
      </div>

      {/* stock action dialog */}
      <Dialog open={!!action} onOpenChange={(o) => (!o ? setAction(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display capitalize">
              {action?.kind === "purchase" ? "Record purchase" : action?.kind === "wastage" ? "Record wastage" : "Stock adjustment"} · {action?.ingredient.name}
            </DialogTitle>
          </DialogHeader>
          <StockActionForm action={action} onDone={() => { setAction(null); refresh(); }} />
        </DialogContent>
      </Dialog>

      {/* new ingredient */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">New ingredient</DialogTitle></DialogHeader>
          <div className="space-y-2.5">
            <Input value={newIng.name} onChange={(e) => setNewIng({ ...newIng, name: e.target.value })} placeholder="Name — e.g. Chicken" className="h-10 rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
              <select value={newIng.unit} onChange={(e) => setNewIng({ ...newIng, unit: e.target.value })} className="h-10 rounded-xl border bg-card px-2 text-[13px]">
                {["KG", "G", "L", "ML", "PCS"].map((u) => <option key={u}>{u}</option>)}
              </select>
              <Input inputMode="decimal" value={newIng.qty} onChange={(e) => setNewIng({ ...newIng, qty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Opening qty" className="tnum h-10 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="decimal" value={newIng.minQty} onChange={(e) => setNewIng({ ...newIng, minQty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Min stock level" className="tnum h-10 rounded-xl" />
              <Input inputMode="decimal" value={newIng.cost} onChange={(e) => setNewIng({ ...newIng, cost: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Cost ₹ / unit" className="tnum h-10 rounded-xl" />
            </div>
            <Input value={newIng.supplier} onChange={(e) => setNewIng({ ...newIng, supplier: e.target.value })} placeholder="Supplier" className="h-10 rounded-xl" />
            <Input value={newIng.location} onChange={(e) => setNewIng({ ...newIng, location: e.target.value })} placeholder="Storage location" className="h-10 rounded-xl" />
            <Button className="h-11 w-full rounded-xl" disabled={!newIng.name.trim()} onClick={async () => {
              try {
                await post("/api/inventory", {
                  kind: "ingredient", name: newIng.name.trim(), unit: newIng.unit, qty: Number(newIng.qty) || 0,
                  minQty: Number(newIng.minQty) || 0, costPerUnitPaise: Math.round(Number(newIng.cost) * 100) || 0,
                  supplier: newIng.supplier || null, location: newIng.location || null,
                });
                toast({ title: "Ingredient added" });
                setNewOpen(false);
                setNewIng({ name: "", unit: "KG", qty: "", minQty: "", cost: "", supplier: "", location: "" });
                refresh();
              } catch (e) {
                toast({ title: "Could not add", description: e instanceof Error ? e.message : "", variant: "destructive" });
              }
            }}>
              Add ingredient
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StockActionForm({ action, onDone }: { action: StockAction; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!action) return null;
  const i = action.ingredient;
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-secondary/60 p-3 text-[12.5px]">
        Current: <strong className="tnum">{i.qty.toFixed(2)} {i.unit}</strong> · min {i.minQty} {i.unit}
        {action.kind === "purchase" && <> · <Money paise={i.costPerUnitPaise} compact />/{i.unit}</>}
      </div>
      <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder={action.kind === "adjustment" ? "Change (use − to reduce)" : `Quantity in ${i.unit}`} className="tnum h-11 rounded-xl text-center text-lg font-bold" />
      {action.kind !== "purchase" && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action.kind === "wastage" ? "Reason — spoilage, spillage…" : "Reason"} className="h-10 rounded-xl" />}
      {action.kind === "purchase" && <p className="text-[11.5px] text-muted-foreground">Estimated cost: <strong className="tnum">{inr(Math.round(Number(qty || 0) * i.costPerUnitPaise))}</strong></p>}
      <Button
        className="h-11 w-full rounded-xl"
        disabled={!qty || busy || (action.kind === "adjustment" && !reason.trim())}
        onClick={async () => {
          setBusy(true);
          try {
            await post("/api/inventory", { kind: action.kind, ingredientId: i.id, qty: Number(qty), reason: reason.trim() || undefined });
            toast({ title: action.kind === "purchase" ? "Stock received" : action.kind === "wastage" ? "Wastage recorded" : "Stock adjusted" });
            onDone();
          } catch (e) {
            toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirm {action.kind}
      </Button>
    </div>
  );
}
