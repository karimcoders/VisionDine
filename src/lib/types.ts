/* VisionDine shared types (API payloads used by both client and server) */
import type { Bill, Discount } from "@/lib/money";

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "WAITER" | "KITCHEN" | "INVENTORY";

export type StaffDTO = { id: string; name: string; role: Role; active: boolean };

export type VariantDTO = { id: string; name: string; priceDeltaPaise: number; available: boolean };
export type AddonDTO = { id: string; name: string; pricePaise: number; available: boolean };

export type MenuItemDTO = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  categoryId: string;
  categoryName?: string;
  diet: string;
  station: string;
  allergens: string | null;
  prepMinutes: number;
  available: boolean;
  soldOut: boolean;
  scheduleNote: string | null;
  variants: VariantDTO[];
  addons: AddonDTO[];
};

export type CategoryDTO = { id: string; name: string; station: string; sortOrder: number; active: boolean };

export type MenuPayload = { categories: CategoryDTO[]; items: MenuItemDTO[] };

export type CartAddon = { name: string; pricePaise: number };
export type CartLine = {
  key: string; // unique line key: menuItemId + variant + addons hash
  menuItemId: string;
  name: string;
  variantName?: string | null;
  unitPricePaise: number; // base + variant delta
  addons: CartAddon[];
  qty: number;
  notes?: string;
  station: string;
};

export type OrderItemDTO = {
  id: string;
  name: string;
  qty: number;
  unitPricePaise: number;
  variantName: string | null;
  addonsJson: string | null;
  notes: string | null;
  station: string;
  status: string;
  createdAt: string;
  readyAt: string | null;
  servedAt: string | null;
};

export type OrderDTO = {
  id: string;
  orderNo: string;
  type: string;
  status: string;
  tableId: string | null;
  tableNumber: number | null;
  subtotalPaise: number;
  discountPaise: number;
  discountReason: string | null;
  couponCode: string | null;
  servicePaise: number;
  taxPaise: number;
  totalPaise: number;
  paymentStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  guestCount: number | null;
  createdVia: string;
  billRequested: boolean;
  assistRequested: boolean;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  staffName: string | null;
  items: OrderItemDTO[];
  payments?: { method: string; amountPaise: number; reference: string | null; createdAt: string }[];
};

export type TableDTO = {
  id: string;
  number: number;
  seats: number;
  zone: string;
  status: string;
  guestCount: number | null;
  openedAt: string | null;
  openOrderId: string | null;
  openOrderNo: string | null;
  openOrderTotalPaise: number;
  openOrderItems: number;
  activeReservations: { id: string; guestName: string; guestCount: number; at: string; note: string | null }[];
};

export type DashboardDTO = {
  today: { grossPaise: number; netPaise: number; orders: number; aovPaise: number; guests: number };
  yesterdayNetPaise: number;
  paymentMix: { method: string; amountPaise: number }[];
  categorySales: { name: string; amountPaise: number }[];
  topItems: { name: string; qty: number; revenuePaise: number }[];
  series: { date: string; netPaise: number; orders: number }[];
  live: { open: number; preparing: number; ready: number; unpaidTotalPaise: number };
  lowStock: { name: string; qty: number; minQty: number; unit: string }[];
  expiring: { name: string; expiresAt: string; qty: number; unit: string }[];
  wastage7dPaise: number;
  refunds7dPaise: number;
  avgPrepMin: number | null;
  delayedOrders: { orderNo: string; tableNumber: number | null; minutes: number }[];
  tablesBusyPct: number;
  staffActive: { name: string; role: string; orders: number }[];
};

export type AnalyticsDTO = {
  rangeDays: number;
  series: { date: string; netPaise: number; orders: number }[];
  totals: { netPaise: number; grossPaise: number; taxPaise: number; discountsPaise: number; orders: number; aovPaise: number };
  paymentMix: { method: string; amountPaise: number }[];
  typeMix: { type: string; orders: number }[];
  topItems: { name: string; qty: number; revenuePaise: number }[];
  slowItems: { name: string; qty: number }[];
  categorySales: { name: string; amountPaise: number }[];
  hourly: { hour: number; orders: number; netPaise: number }[];
  refunds: { count: number; amountPaise: number };
  cancelled: number;
};

export type SettingsDTO = {
  profile: { name: string; legalName?: string; address?: string; phone?: string; email?: string; gstin?: string; fssai?: string };
  tax: { gstPercent: number; taxInclusive: boolean; serviceChargePercent: number };
  receipt: { footer: string };
  orderPrefix: { prefix: string };
  hours: { open: string; close: string; closedOn: string };
  loyalty: { enabled: boolean; earnPerHundred: number };
};

export type IngredientDTO = {
  id: string;
  name: string;
  unit: string;
  qty: number;
  minQty: number;
  costPerUnitPaise: number;
  supplier: string | null;
  location: string | null;
  expiresAt: string | null;
};

export type MovementDTO = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  type: string;
  qtyDelta: number;
  reason: string | null;
  orderRef: string | null;
  staffName: string | null;
  createdAt: string;
};

export type CustomerDTO = {
  id: string;
  name: string;
  phone: string;
  loyaltyPoints: number;
  visits: number;
  totalSpentPaise: number;
  createdAt: string;
};

export type AuditDTO = { id: string; staffName: string; role: string; action: string; detail: string; createdAt: string };

export type BillResult = Bill & { couponError?: string };

export type View =
  | "dashboard" | "pos" | "tables" | "orders" | "kitchen" | "menu"
  | "inventory" | "billing" | "customers" | "staff" | "analytics"
  | "assistant" | "qr" | "settings";
