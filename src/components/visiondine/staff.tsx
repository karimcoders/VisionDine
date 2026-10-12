/* Staff, roles and audit trail */
"use client";
import { useState } from "react";
import { patch, post, usePolling } from "@/lib/api";
import type { AuditDTO } from "@/lib/types";
import { EmptyState, RoleBadge, SectionLabel, StatusPill } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ScrollText, ShieldCheck, UserPlus, Users } from "lucide-react";

type Staff = { id: string; name: string; role: string; active: boolean };

const ROLES = ["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "INVENTORY"];

export default function StaffView() {
  const { data, loading, refresh } = usePolling<{ staff: Staff[]; audits: AuditDTO[] }>("/api/staff", 20000);
  const [tab, setTab] = useState<"team" | "audit">("team");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "WAITER", pin: "" });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-4 py-3">
        <div className="flex rounded-xl border bg-card p-1">
          {(["team", "audit"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-[12.5px] font-semibold", tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
              {t === "team" ? "Team" : "Audit log"}
            </button>
          ))}
        </div>
        {tab === "team" && (
          <Button className="ml-auto rounded-xl" onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add staff
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}</div>}

        {tab === "team" && !loading && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.staff || []).map((s) => (
              <div key={s.id} className={cn("rounded-2xl border bg-card p-4 shadow-soft", !s.active && "opacity-55")}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-[14px] font-bold text-primary">
                      {s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div>
                      <div className="text-[14px] font-bold">{s.name}</div>
                      <RoleBadge role={s.role} />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await patch("/api/staff", { id: s.id, toggleActive: true });
                        refresh();
                      } catch (e) {
                        toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
                      }
                    }}
                    className="text-[11.5px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="mt-3">
                  <SectionLabel className="mb-1">Access PIN</SectionLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue="••••"
                      inputMode="numeric" maxLength={4}
                      className="tnum h-9 w-24 rounded-lg tracking-[0.4em]"
                      onBlur={async (e) => {
                        const pin = e.target.value.replace(/\D/g, "");
                        if (pin.length === 4) {
                          try {
                            await patch("/api/staff", { id: s.id, pin });
                            toast({ title: "PIN updated", description: s.name });
                          } catch (err) {
                            toast({ title: "Failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
                          }
                        } else e.target.value = "••••";
                      }}
                    />
                    <span className="text-[11px] text-muted-foreground">4 digits · used at login</span>
                  </div>
                </div>
              </div>
            ))}
            {!loading && (data?.staff || []).length === 0 && <div className="col-span-full"><EmptyState icon={<Users className="h-5 w-5" />} title="No staff" /></div>}
          </div>
        )}

        {tab === "audit" && !loading && (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-secondary/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Actor</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(data?.audits || []).map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground tnum">{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">{a.staffName}</span> <span className="text-muted-foreground">({a.role.toLowerCase()})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={a.action.includes("CANCEL") || a.action.includes("REFUND") || a.action.includes("WASTAGE") ? "red" : a.action.includes("PAYMENT") ? "green" : "gray"} dot={false}>{a.action.replaceAll("_", " ")}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && (data?.audits || []).length === 0 && <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No audit entries" />}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><ShieldCheck className="h-4.5 w-4.5 text-primary" /> Add staff member</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="h-11 rounded-xl" />
            <div className="grid grid-cols-3 gap-1.5">
              {ROLES.map((r) => (
                <button key={r} onClick={() => setForm({ ...form, role: r })} className={cn("rounded-xl border px-1 py-2 text-[10.5px] font-bold", form.role === r ? "border-primary bg-accent text-primary" : "text-muted-foreground")}>
                  {r}
                </button>
              ))}
            </div>
            <Input inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} placeholder="4-digit PIN" className="tnum h-11 rounded-xl text-center tracking-[0.5em]" />
            <Button className="h-11 w-full rounded-xl" disabled={!form.name.trim() || form.pin.length !== 4} onClick={async () => {
              try {
                await post("/api/staff", form);
                toast({ title: `${form.name} added`, description: `${form.role} · PIN set` });
                setOpen(false);
                setForm({ name: "", role: "WAITER", pin: "" });
                refresh();
              } catch (e) {
                toast({ title: "Could not add", description: e instanceof Error ? e.message : "", variant: "destructive" });
              }
            }}>
              Add to team
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
