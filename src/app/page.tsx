/* VisionDine root — the entire app surfaces from `/` (sandbox single-route constraint).
   Handles three modes via query params:
     /                    → staff app (login + shell + views)
     /?qr=menu&table=N    → customer QR ordering
     /?qr=status&orderNo= → customer order tracking                       */
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useVision } from "@/lib/store";
import type { Auth, View as ViewName } from "@/lib/store";
import LoginView from "@/components/visiondine/login";
import Shell from "@/components/visiondine/shell";
import DashboardView from "@/components/visiondine/dashboard";
import PosView from "@/components/visiondine/pos";
import TablesView from "@/components/visiondine/tables";
import OrdersView from "@/components/visiondine/orders";
import KitchenView from "@/components/visiondine/kitchen";
import MenuAdminView from "@/components/visiondine/menu-admin";
import InventoryView from "@/components/visiondine/inventory";
import BillingView from "@/components/visiondine/billing";
import CustomersView from "@/components/visiondine/customers";
import StaffView from "@/components/visiondine/staff";
import AnalyticsView from "@/components/visiondine/analytics";
import AssistantView from "@/components/visiondine/assistant";
import SettingsView from "@/components/visiondine/settings";
import CustomerMenuView from "@/components/visiondine/customer-menu";
import CustomerStatusView from "@/components/visiondine/customer-status";
import { Loader2 } from "lucide-react";

type QrMode = { kind: "menu"; table: number | null } | { kind: "status"; orderNo: string } | null;

export default function Page() {
  const { auth, view, setAuth } = useVision();
  const [booted, setBooted] = useState(false);
  const [qr, setQr] = useState<QrMode>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    api<{ auth: Auth | null }>("/api/auth")
      .then((res) => {
        if (res.auth) setAuth(res.auth);
      })
      .catch(() => undefined)
      .finally(() => {
        // decide QR/customer mode after boot (async callback keeps first paint stable)
        if (params.get("qr") === "menu") {
          const t = params.get("table");
          setQr({ kind: "menu", table: t ? Number(t) : null });
        } else if (params.get("qr") === "status") {
          setQr({ kind: "status", orderNo: params.get("orderNo") || "" });
        }
        setBooted(true);
      });
  }, [setAuth]);

  /* ---------- customer QR views ---------- */
  if (qr?.kind === "menu") {
    return (
      <CustomerMenuView
        tableNo={qr.table}
        onTrack={(orderNo) => {
          window.location.search = `?qr=status&orderNo=${encodeURIComponent(orderNo)}`;
        }}
      />
    );
  }
  if (qr?.kind === "status") {
    return <CustomerStatusView orderNo={qr.orderNo} onNewOrder={() => { window.location.search = "?qr=menu"; }} />;
  }

  /* ---------- staff app ---------- */
  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-[13px] font-medium text-muted-foreground">VisionDine starting up…</span>
        </div>
      </div>
    );
  }
  if (!auth) return <LoginView />;

  const VIEWS: Record<ViewName, React.ComponentType> = {
    dashboard: DashboardView,
    pos: PosView,
    tables: TablesView,
    orders: OrdersView,
    kitchen: KitchenView,
    menu: MenuAdminView,
    inventory: InventoryView,
    billing: BillingView,
    customers: CustomersView,
    staff: StaffView,
    analytics: AnalyticsView,
    assistant: AssistantView,
    qr: SettingsView, // QR manager lives inside Settings tab; "qr" nav opens settings on qr tab
    settings: SettingsView,
  };
  const Active = VIEWS[view] || DashboardView;

  return (
    <Shell>
      <Active />
    </Shell>
  );
}
