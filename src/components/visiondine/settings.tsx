/* Settings — profile, tax, receipt, hours, loyalty + QR code manager */
"use client";
import { useState } from "react";
import { patch, usePolling } from "@/lib/api";
import { useVision } from "@/lib/store";
import type { SettingsDTO, TableDTO } from "@/lib/types";
import { Logo, SectionLabel } from "@/components/visiondine/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Save, QrCode } from "lucide-react";

const TABS = ["restaurant", "billing", "qr"] as const;

export default function SettingsView() {
  const { data: settings, refresh } = usePolling<SettingsDTO>("/api/settings");
  const { data: tables } = usePolling<TableDTO[]>("/api/tables");
  const [tab, setTab] = useState<(typeof TABS)[number]>(() => (useVision.getState().view === "qr" ? "qr" : "restaurant"));

  async function save(key: string, value: unknown) {
    try {
      await patch("/api/settings", { key, value });
      toast({ title: "Settings saved" });
      refresh();
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b bg-card/60 px-4 py-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-2 text-[12.5px] font-semibold capitalize", tab === t ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary")}>
            {t === "qr" ? "QR ordering" : t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {tab === "restaurant" && settings && <RestaurantForms key={JSON.stringify(settings)} settings={settings} onSave={save} />}

        {tab === "billing" && (
          <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-soft">
            <div className="font-display text-[16px] font-bold">Receipt preview (80mm thermal)</div>
            <p className="text-[12.5px] text-muted-foreground">Sample layout using current settings — print any settled bill from Billing History.</p>
            <div className="mt-4 flex justify-center"><SampleReceipt name={settings?.profile.name || "VisionDine"} gstin={settings?.profile.gstin || ""} /></div>
          </div>
        )}

        {tab === "qr" && <QrManager tables={tables || []} />}
      </div>
    </div>
  );
}

function RestaurantForms({ settings, onSave }: { settings: SettingsDTO; onSave: (key: string, value: unknown) => void }) {
  const [profile, setProfile] = useState(settings.profile);
  const [tax, setTax] = useState(settings.tax);
  const [receipt, setReceipt] = useState(settings.receipt);
  const [hours, setHours] = useState(settings.hours);
  const [loyalty, setLoyalty] = useState(settings.loyalty);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-3">
          <Logo size={38} withWord={false} />
          <div>
            <div className="font-display text-[16px] font-bold">Restaurant profile</div>
            <div className="text-[12px] text-muted-foreground">Printed on every receipt</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name"><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="h-10 rounded-xl" /></Field>
          <Field label="Legal entity"><Input value={profile.legalName || ""} onChange={(e) => setProfile({ ...profile, legalName: e.target.value })} className="h-10 rounded-xl" /></Field>
          <Field label="Phone"><Input value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="tnum h-10 rounded-xl" /></Field>
          <Field label="Email"><Input value={profile.email || ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="h-10 rounded-xl" /></Field>
          <Field label="GSTIN"><Input value={profile.gstin || ""} onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })} className="tnum h-10 rounded-xl" /></Field>
          <Field label="FSSAI license"><Input value={profile.fssai || ""} onChange={(e) => setProfile({ ...profile, fssai: e.target.value })} className="tnum h-10 rounded-xl" /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={profile.address || ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="rounded-xl" /></Field>
        </div>
        <Button className="mt-4 rounded-xl" onClick={() => onSave("profile", profile)}><Save className="mr-1.5 h-4 w-4" /> Save profile</Button>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="font-display text-[16px] font-bold">Tax & charges</div>
        <p className="mb-4 text-[12px] text-muted-foreground">Configure per your jurisdiction — verify current rates with your CA.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="GST %"><Input inputMode="decimal" value={tax.gstPercent} onChange={(e) => setTax({ ...tax, gstPercent: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} className="tnum h-10 rounded-xl" /></Field>
          <Field label="Service charge %"><Input inputMode="decimal" value={tax.serviceChargePercent} onChange={(e) => setTax({ ...tax, serviceChargePercent: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} className="tnum h-10 rounded-xl" /></Field>
          <Field label="Price mode">
            <div className="flex gap-1.5">
              {[true, false].map((inc) => (
                <button key={String(inc)} onClick={() => setTax({ ...tax, taxInclusive: inc })} className={cn("flex-1 rounded-xl border py-2 text-[12px] font-semibold", tax.taxInclusive === inc ? "border-primary bg-accent text-primary" : "text-muted-foreground")}>
                  {inc ? "Inclusive" : "Exclusive"}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Button className="mt-4 rounded-xl" onClick={() => onSave("tax", tax)}><Save className="mr-1.5 h-4 w-4" /> Save tax rules</Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="font-display text-[16px] font-bold">Business hours</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Opens"><Input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} className="h-10 rounded-xl" /></Field>
            <Field label="Closes"><Input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} className="h-10 rounded-xl" /></Field>
          </div>
          <Button className="mt-4 rounded-xl" onClick={() => onSave("hours", hours)}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="font-display text-[16px] font-bold">Loyalty</div>
          <div className="mt-3 space-y-3">
            <Field label="Points per ₹100 spent">
              <Input inputMode="numeric" value={loyalty.earnPerHundred} onChange={(e) => setLoyalty({ ...loyalty, earnPerHundred: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="tnum h-10 rounded-xl" />
            </Field>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={loyalty.enabled} onChange={(e) => setLoyalty({ ...loyalty, enabled: e.target.checked })} className="h-4 w-4 rounded" />
              Loyalty program enabled
            </label>
          </div>
          <Button className="mt-4 rounded-xl" onClick={() => onSave("loyalty", loyalty)}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="font-display text-[16px] font-bold">Receipt footer</div>
        <Textarea value={receipt.footer} onChange={(e) => setReceipt({ footer: e.target.value })} className="mt-3 rounded-xl" placeholder="Thank-you note, feedback number…" />
        <Button className="mt-4 rounded-xl" onClick={() => onSave("receipt", receipt)}><Save className="mr-1.5 h-4 w-4" /> Save footer</Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <SectionLabel className="mb-1">{label}</SectionLabel>
      {children}
    </div>
  );
}

function SampleReceipt({ name, gstin }: { name: string; gstin: string }) {
  return (
    <div className="w-[300px] rounded-lg border bg-white px-5 py-5 font-mono text-[11.5px] leading-[1.5] text-[#1c1917]" style={{ fontFamily: "'Courier New', monospace" }}>
      <div className="text-center">
        <div className="text-[14px] font-bold uppercase">{name}</div>
        {gstin && <div className="text-[10px]">GSTIN: {gstin}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-[#a8a29e]" />
      <div className="flex justify-between"><span>Receipt: VD-XXXX</span><span className="tnum">Today</span></div>
      <div className="my-2 border-t border-dashed border-[#a8a29e]" />
      <div className="flex justify-between"><span>2 × Butter Chicken</span><span className="tnum">₹890</span></div>
      <div className="flex justify-between"><span>3 × Butter Naan</span><span className="tnum">₹195</span></div>
      <div className="my-2 border-t border-dashed border-[#a8a29e]" />
      <div className="flex justify-between"><span>Subtotal</span><span className="tnum">₹1,085.00</span></div>
      <div className="flex justify-between"><span>GST 5% (incl.)</span><span className="tnum">₹51.67</span></div>
      <div className="mt-1 flex justify-between border-t border-[#a8a29e] pt-1 text-[13px] font-bold"><span>TOTAL</span><span className="tnum">₹1,085.00</span></div>
      <div className="mt-3 text-center text-[12px] font-bold tracking-[0.2em]">PAID</div>
    </div>
  );
}

function QrManager({ tables }: { tables: TableDTO[] }) {
  const menuUrl = `/?qr=menu`;

  async function printTableQR(t: TableDTO) {
    const url = `${window.location.origin}/?qr=menu&table=${t.number}`;
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) {
      toast({ title: "Allow pop-ups to print", variant: "destructive" });
      return;
    }
    w.document.write(`<!doctype html><html><head><title>Table ${t.number} QR</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
      .card{border:2px solid #0f766e;border-radius:20px;padding:36px 44px}
      h1{font-size:26px;margin:14px 0 4px} p{color:#555;margin:4px 0}</style></head><body>
      <div class="card">
        <strong style="color:#0f766e;letter-spacing:2px">VISIONDINE</strong>
        <h1>Table ${t.number}</h1>
        <p>Scan to view menu & order</p>
        <div id="qr"></div>
        <p style="font-size:12px;margin-top:10px">${url}</p>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
      <script>
        var qr = qrcode(0, 'M'); qr.addData(${JSON.stringify(url)}); qr.make();
        document.getElementById('qr').innerHTML = qr.createImgTag(4, 8);
        setTimeout(function(){ window.print(); }, 500);
      <\/script>
    </body></html>`);
    w.document.close();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-soft">
        <div className="rounded-xl border bg-white p-2.5">
          <QRCodeSVG value={menuUrl} size={86} fgColor="#1c1917" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-display text-[16px] font-bold"><QrCode className="h-4.5 w-4.5 text-primary" /> Restaurant menu QR</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Table QR codes carry the table number so orders land on the right table. Guests browse without any app install or account.
          </p>
          <code className="mt-1.5 block truncate rounded-lg bg-secondary px-2.5 py-1.5 text-[11.5px]">{menuUrl}?table=…</code>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border bg-white p-1.5">
                <QRCodeSVG value={`/?qr=menu&table=${t.number}`} size={52} fgColor="#1c1917" />
              </div>
              <div>
                <div className="tnum font-display text-[18px] font-extrabold">T{t.number}</div>
                <div className="text-[11px] text-muted-foreground">{t.zone} · {t.seats} seats</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <a href={`/?qr=menu&table=${t.number}`} target="_blank" className="flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold text-muted-foreground hover:bg-secondary">
                <QrCode className="h-3 w-3" /> Open
              </a>
              <button onClick={() => printTableQR(t)} className="flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11.5px] font-bold text-primary-foreground">
                <Printer className="h-3 w-3" /> Print
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
