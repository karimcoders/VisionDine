/* Menu management — categories + items CRUD, variants, add-ons, availability */
"use client";
import { useState } from "react";
import { patch, post, api, usePolling } from "@/lib/api";
import { inr } from "@/lib/money";
import type { MenuPayload, MenuItemDTO } from "@/lib/types";
import { EmptyState, Money, SectionLabel, StatusPill, VegMark } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Pencil, Plus, Power, Search, Trash2, UtensilsCrossed, X } from "lucide-react";

const STATIONS = ["MAIN", "TANDOOR", "BEVERAGE", "DESSERT"];
const DIETS = ["VEG", "NONVEG", "EGG", "VEGAN"];

type FormState = {
  id?: string; name: string; description: string; price: string; categoryId: string; diet: string;
  station: string; allergens: string; prepMinutes: string; available: boolean; soldOut: boolean;
  variants: { name: string; priceDelta: string }[]; addons: { name: string; price: string }[];
};

const EMPTY: FormState = { name: "", description: "", price: "", categoryId: "", diet: "VEG", station: "MAIN", allergens: "", prepMinutes: "12", available: true, soldOut: false, variants: [], addons: [] };

export default function MenuAdminView() {
  const { data: menu, loading, refresh } = usePolling<MenuPayload>("/api/menu");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [catDialog, setCatDialog] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", station: "MAIN" });
  const [busy, setBusy] = useState(false);

  const items = (menu?.items || []).filter((m) => (cat === "all" || m.categoryId === cat) && (!q || m.name.toLowerCase().includes(q.toLowerCase())));

  async function toggle(m: MenuItemDTO, field: "available" | "soldOut") {
    try {
      await patch("/api/menu", { kind: field === "available" ? "item-toggle" : "item-soldout", id: m.id, [field]: !m[field] });
      refresh();
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function saveItem() {
    if (!form) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name, description: form.description, pricePaise: Math.round(Number(form.price) * 100),
        categoryId: form.categoryId || menu?.categories[0]?.id, diet: form.diet, station: form.station,
        allergens: form.allergens, prepMinutes: Number(form.prepMinutes) || 12,
        available: form.available, soldOut: form.soldOut,
        variants: form.variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), priceDeltaPaise: Math.round(Number(v.priceDelta || 0) * 100) })),
        addons: form.addons.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), pricePaise: Math.round(Number(a.price || 0) * 100) })),
      };
      if (form.id) await patch("/api/menu", { id: form.id, ...payload });
      else await post("/api/menu", payload);
      toast({ title: form.id ? "Item updated" : "Item created", description: `${form.name} · ${inr(Math.round(Number(form.price) * 100))}` });
      setForm(null);
      refresh();
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(m: MenuItemDTO) {
    if (!window.confirm(`Delete "${m.name}" from the menu? Past orders keep their recorded prices.`)) return;
    try {
      await api(`/api/menu?id=${m.id}`, { method: "DELETE" });
      toast({ title: "Item deleted" });
      refresh();
    } catch (e) {
      toast({ title: "Could not delete", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu…" className="h-10 rounded-xl pl-9" />
        </div>
        <div className="flex flex-1 gap-1 overflow-x-auto no-scrollbar">
          <button onClick={() => setCat("all")} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold", cat === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>All</button>
          {menu?.categories.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold", cat === c.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>{c.name}</button>
          ))}
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => setCatDialog(true)}>
          <Plus className="h-4 w-4" /> Category
        </Button>
        <Button className="rounded-xl" onClick={() => { setForm({ ...EMPTY, categoryId: cat === "all" ? menu?.categories[0]?.id || "" : cat }); }}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}</div>}
        {!loading && items.length === 0 && <EmptyState icon={<UtensilsCrossed className="h-5 w-5" />} title="No items" hint="Add your first dish to this category." />}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((m) => (
            <div key={m.id} className={cn("rounded-2xl border bg-card p-4 shadow-soft", (!m.available || m.soldOut) && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <VegMark diet={m.diet} />
                    <span className="truncate text-[14px] font-bold">{m.name}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{m.description}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Money paise={m.pricePaise} className="text-[14px] font-extrabold text-primary" />
                    <StatusPill tone="outline" dot={false}>{m.station}</StatusPill>
                    {m.soldOut && <StatusPill tone="red" dot={false}>Sold out</StatusPill>}
                    {!m.available && <StatusPill tone="gray" dot={false}>Hidden</StatusPill>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => toggle(m, "available")} title={m.available ? "Hide from menu" : "Show on menu"} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
                    <Power className={cn("h-4 w-4", m.available && "text-emerald-600")} />
                  </button>
                  <button onClick={() => toggle(m, "soldOut")} title="Toggle sold out" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
                    <span className={cn("block h-3.5 w-3.5 rounded-full border-2", m.soldOut ? "border-red-500 bg-red-500" : "border-stone-400")} />
                  </button>
                  <button onClick={() => setForm({
                    id: m.id, name: m.name, description: m.description || "", price: (m.pricePaise / 100).toFixed(0),
                    categoryId: m.categoryId, diet: m.diet, station: m.station, allergens: m.allergens || "",
                    prepMinutes: String(m.prepMinutes), available: m.available, soldOut: m.soldOut,
                    variants: m.variants.map((v) => ({ name: v.name, priceDelta: (v.priceDeltaPaise / 100).toFixed(0) })),
                    addons: m.addons.map((a) => ({ name: a.name, price: (a.pricePaise / 100).toFixed(0) })),
                  })} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteItem(m)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {(m.variants.length > 0 || m.addons.length > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {m.variants.map((v) => <span key={v.id} className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{v.name} {v.priceDeltaPaise !== 0 ? (v.priceDeltaPaise > 0 ? `+${inr(v.priceDeltaPaise)}` : `-${inr(-v.priceDeltaPaise)}`) : ""}</span>)}
                  {m.addons.map((a) => <span key={a.id} className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-accent-foreground">+{a.name}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* item form */}
      <Dialog open={!!form} onOpenChange={(o) => (!o ? setForm(null) : undefined)}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{form?.id ? "Edit item" : "New menu item"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <SectionLabel className="mb-1">Name</SectionLabel>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 rounded-xl" placeholder="e.g. Paneer Tikka Malai" />
              </div>
              <div>
                <SectionLabel className="mb-1">Description</SectionLabel>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[60px] rounded-xl" placeholder="Short, appetising description" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <SectionLabel className="mb-1">Price (₹)</SectionLabel>
                  <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })} className="tnum h-10 rounded-xl" />
                </div>
                <div>
                  <SectionLabel className="mb-1">Prep time (min)</SectionLabel>
                  <Input inputMode="numeric" value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value.replace(/\D/g, "") })} className="tnum h-10 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <SectionLabel className="mb-1">Category</SectionLabel>
                  <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="h-10 w-full rounded-xl border bg-card px-2 text-[13px]">
                    {menu?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <SectionLabel className="mb-1">Kitchen station</SectionLabel>
                  <div className="flex gap-1">
                    {STATIONS.map((s) => (
                      <button key={s} onClick={() => setForm({ ...form, station: s })} className={cn("flex-1 rounded-lg border py-2 text-[10.5px] font-bold", form.station === s ? "border-primary bg-accent text-primary" : "text-muted-foreground")}>
                        {s.slice(0, 4)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">Dietary</SectionLabel>
                <div className="flex gap-1.5">
                  {DIETS.map((d) => (
                    <button key={d} onClick={() => setForm({ ...form, diet: d })} className={cn("flex-1 rounded-xl border py-2 text-[12px] font-semibold", form.diet === d ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:bg-secondary")}>
                      {d === "NONVEG" ? "Non-veg" : d === "EGG" ? "Egg" : d.charAt(0) + d.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">Allergens (comma separated)</SectionLabel>
                <Input value={form.allergens} onChange={(e) => setForm({ ...form, allergens: e.target.value })} className="h-10 rounded-xl" placeholder="Dairy, Nuts" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <SectionLabel>Portion variants</SectionLabel>
                  <button onClick={() => setForm({ ...form, variants: [...form.variants, { name: "", priceDelta: "" }] })} className="text-[12px] font-bold text-primary">+ Add</button>
                </div>
                {form.variants.map((v, i) => (
                  <div key={i} className="mb-1.5 flex gap-1.5">
                    <Input value={v.name} onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Half / Full / Large" className="h-9 flex-1 rounded-lg" />
                    <Input inputMode="decimal" value={v.priceDelta} onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, priceDelta: e.target.value.replace(/[^\d.-]/g, "") } : x)) })} placeholder="± ₹" className="tnum h-9 w-24 rounded-lg" />
                    <button onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <SectionLabel>Add-ons</SectionLabel>
                  <button onClick={() => setForm({ ...form, addons: [...form.addons, { name: "", price: "" }] })} className="text-[12px] font-bold text-primary">+ Add</button>
                </div>
                {form.addons.map((a, i) => (
                  <div key={i} className="mb-1.5 flex gap-1.5">
                    <Input value={a.name} onChange={(e) => setForm({ ...form, addons: form.addons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Extra cheese" className="h-9 flex-1 rounded-lg" />
                    <Input inputMode="decimal" value={a.price} onChange={(e) => setForm({ ...form, addons: form.addons.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)) })} placeholder="₹" className="tnum h-9 w-24 rounded-lg" />
                    <button onClick={() => setForm({ ...form, addons: form.addons.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <Button className="h-11 w-full rounded-xl" disabled={!form.name.trim() || !form.price || busy} onClick={saveItem}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {form.id ? "Save changes" : "Create item"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* category dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">New category</DialogTitle></DialogHeader>
          <Input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="e.g. Chinese" className="h-11 rounded-xl" />
          <div className="flex gap-1.5">
            {STATIONS.map((s) => (
              <button key={s} onClick={() => setNewCat({ ...newCat, station: s })} className={cn("flex-1 rounded-xl border py-2 text-[12px] font-bold", newCat.station === s ? "border-primary bg-accent text-primary" : "text-muted-foreground")}>
                {s}
              </button>
            ))}
          </div>
          <Button className="h-11 rounded-xl" disabled={!newCat.name.trim()} onClick={async () => {
            try {
              await post("/api/menu", { kind: "category", name: newCat.name.trim(), station: newCat.station });
              toast({ title: "Category created" });
              setCatDialog(false);
              setNewCat({ name: "", station: "MAIN" });
              refresh();
            } catch (e) {
              toast({ title: "Could not create", description: e instanceof Error ? e.message : "", variant: "destructive" });
            }
          }}>
            Create category
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
