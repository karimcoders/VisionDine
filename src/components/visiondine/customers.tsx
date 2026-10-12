/* Customers & loyalty */
"use client";
import { useState } from "react";
import { post, usePolling } from "@/lib/api";
import { inr } from "@/lib/money";
import type { CustomerDTO } from "@/lib/types";
import { EmptyState, Money, SectionLabel, StatusPill } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Search, Star, UserPlus, Users } from "lucide-react";

export default function CustomersView() {
  const { data, loading, refresh } = usePolling<CustomerDTO[]>("/api/customers", 20000);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });

  const list = (data || []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone…" className="h-10 rounded-xl pl-9" />
        </div>
        <Button className="ml-auto rounded-xl" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> Add customer
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}</div>}
        {!loading && list.length === 0 && <EmptyState icon={<Users className="h-5 w-5" />} title="No customers yet" hint="Guests added at checkout appear here with loyalty points." />}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-[14px] font-bold text-primary">
                    {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div>
                    <div className="text-[14px] font-bold">{c.name}</div>
                    <div className="tnum text-[12px] text-muted-foreground">+91 {c.phone}</div>
                  </div>
                </div>
                <StatusPill tone="gold" dot={false}><Star className="mr-1 h-3 w-3" />{c.loyaltyPoints} pts</StatusPill>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-secondary/60 py-2">
                  <div className="tnum font-display text-[16px] font-bold">{c.visits}</div>
                  <div className="text-[10.5px] text-muted-foreground">visits</div>
                </div>
                <div className="rounded-xl bg-secondary/60 py-2">
                  <Money paise={c.totalSpentPaise} compact className="font-display text-[16px] font-bold" />
                  <div className="text-[10.5px] text-muted-foreground">lifetime value</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Add customer</DialogTitle></DialogHeader>
          <div className="space-y-2.5">
            <div>
              <SectionLabel className="mb-1">Name</SectionLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" />
            </div>
            <div>
              <SectionLabel className="mb-1">Phone (10 digits)</SectionLabel>
              <Input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="tnum h-11 rounded-xl" placeholder="98—" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">Collect only what guests volunteer. Phone is used for order lookup and loyalty — handled per your data policy.</p>
            <Button className="h-11 w-full rounded-xl" disabled={!form.name.trim() || form.phone.length !== 10} onClick={async () => {
              try {
                await post("/api/customers", form);
                toast({ title: "Customer added", description: `${form.name} · ${inr(0)} to start` });
                setOpen(false);
                setForm({ name: "", phone: "" });
                refresh();
              } catch (e) {
                toast({ title: "Could not add", description: e instanceof Error ? e.message : "", variant: "destructive" });
              }
            }}>
              Save customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
