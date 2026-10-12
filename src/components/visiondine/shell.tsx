/* App shell — sidebar navigation + topbar; role-aware nav */
"use client";
import { useVision } from "@/lib/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/visiondine/ui-bits";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Calculator, Armchair, ClipboardList, ChefHat, UtensilsCrossed,
  Package, ReceiptText, Users, UserCog, BarChart3, Sparkles, QrCode, Settings2, LogOut, Menu as MenuIcon, X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import type { View } from "@/lib/types";

const NAV: { view: View; label: string; icon: React.ComponentType<{ className?: string }>; roles: string[]; group: string }[] = [
  { view: "dashboard", label: "Overview", icon: LayoutDashboard, roles: ["OWNER", "MANAGER", "CASHIER"], group: "Service" },
  { view: "pos", label: "POS Terminal", icon: Calculator, roles: ["OWNER", "MANAGER", "CASHIER", "WAITER"], group: "Service" },
  { view: "tables", label: "Tables & Floor", icon: Armchair, roles: ["OWNER", "MANAGER", "CASHIER", "WAITER"], group: "Service" },
  { view: "orders", label: "Orders", icon: ClipboardList, roles: ["OWNER", "MANAGER", "CASHIER", "WAITER"], group: "Service" },
  { view: "kitchen", label: "Kitchen Display", icon: ChefHat, roles: ["OWNER", "MANAGER", "KITCHEN", "CASHIER", "WAITER"], group: "Service" },
  { view: "menu", label: "Menu", icon: UtensilsCrossed, roles: ["OWNER", "MANAGER", "INVENTORY"], group: "Manage" },
  { view: "inventory", label: "Inventory", icon: Package, roles: ["OWNER", "MANAGER", "INVENTORY"], group: "Manage" },
  { view: "billing", label: "Billing History", icon: ReceiptText, roles: ["OWNER", "MANAGER", "CASHIER"], group: "Manage" },
  { view: "customers", label: "Customers", icon: Users, roles: ["OWNER", "MANAGER", "CASHIER"], group: "Manage" },
  { view: "qr", label: "QR Ordering", icon: QrCode, roles: ["OWNER", "MANAGER", "CASHIER"], group: "Manage" },
  { view: "analytics", label: "Reports", icon: BarChart3, roles: ["OWNER", "MANAGER"], group: "Insight" },
  { view: "assistant", label: "AI Assistant", icon: Sparkles, roles: ["OWNER", "MANAGER", "CASHIER"], group: "Insight" },
  { view: "staff", label: "Staff & Audit", icon: UserCog, roles: ["OWNER", "MANAGER"], group: "Insight" },
  { view: "settings", label: "Settings", icon: Settings2, roles: ["OWNER", "MANAGER"], group: "Insight" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { auth, view, setView } = useVision();
  const mobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  if (!auth) return null;

  const allowed = NAV.filter((n) => n.roles.includes(auth.role));
  const groups = [...new Set(allowed.map((n) => n.group))];
  const current = NAV.find((n) => n.view === view);
  const title = current?.label || "VisionDine";

  async function logout() {
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    } catch {
      /* cookie cleared regardless */
    }
    useVision.getState().setAuth(null);
    toast({ title: "Signed out", description: "See you on the next shift." });
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo size={30} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g}>
            <div className="section-label px-3 pb-1.5">{g}</div>
            <div className="space-y-0.5">
              {allowed.filter((n) => n.group === g).map((n) => {
                const Icon = n.icon;
                const active = view === n.view;
                return (
                  <button
                    key={n.view}
                    onClick={() => {
                      setView(n.view);
                      setOpenMobile(false);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all",
                      active ? "bg-primary text-primary-foreground shadow-soft" : "text-secondary-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                    {n.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
            {auth.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight">{auth.name}</div>
            <div className="text-[11px] text-muted-foreground">{auth.role.charAt(0) + auth.role.slice(1).toLowerCase()}</div>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {!mobile && <aside className="w-[232px] shrink-0 border-r border-sidebar-border bg-sidebar">{nav}</aside>}

      {/* Mobile drawer */}
      {mobile && openMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpenMobile(false)} />
          <aside className="absolute left-0 top-0 h-full w-[270px] bg-sidebar shadow-lift">
            <button className="absolute right-3 top-4 rounded-lg p-2 text-muted-foreground" onClick={() => setOpenMobile(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/70 px-4 backdrop-blur md:px-6">
          {mobile && (
            <button onClick={() => setOpenMobile(true)} className="rounded-lg p-2 hover:bg-secondary" aria-label="Open menu">
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="section-label hidden sm:block">VisionDine · Bandra West</div>
            <h1 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Terminal online
            </span>
            <span className="tnum hidden rounded-full border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground md:inline-flex">
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
              {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
