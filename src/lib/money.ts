/* VisionDine money engine — pure, shared client+server.
   All amounts in INTEGER PAISE. Single source of truth for billing math. */

export type TaxConfig = {
  gstPercent: number;
  taxInclusive: boolean;
  serviceChargePercent: number;
};

export const DEFAULT_TAX: TaxConfig = { gstPercent: 5, taxInclusive: true, serviceChargePercent: 0 };

export type Discount = { kind: "PERCENT" | "FLAT"; value: number } | null;

export type BillLine = { qty: number; unitPricePaise: number };

export type Bill = {
  subtotalPaise: number;
  discountPaise: number;
  servicePaise: number;
  taxPaise: number;
  totalPaise: number;
};

/** Canonical bill computation — used by POS preview AND server order creation. */
export function computeBill(lines: BillLine[], discount: Discount, cfg: TaxConfig): Bill {
  const subtotalPaise = lines.reduce((s, l) => s + Math.round(l.qty) * Math.round(l.unitPricePaise), 0);
  let discountPaise = 0;
  if (discount && subtotalPaise > 0) {
    if (discount.kind === "PERCENT") discountPaise = Math.round((subtotalPaise * discount.value) / 100);
    else discountPaise = Math.min(discount.value, subtotalPaise);
  }
  const afterDiscount = subtotalPaise - discountPaise;
  const servicePaise = Math.round((afterDiscount * (cfg.serviceChargePercent || 0)) / 100);
  const base = afterDiscount + servicePaise;
  const gst = cfg.gstPercent || 0;
  // Inclusive: tax is embedded in the quoted price (Indian restaurant standard) — back-compute.
  // Exclusive: tax is added on top of the base.
  const taxPaise =
    cfg.taxInclusive ? Math.round((base * gst) / (100 + gst)) : Math.round((base * gst) / 100);
  const totalPaise = cfg.taxInclusive ? base : base + taxPaise;
  return { subtotalPaise, discountPaise, servicePaise, taxPaise, totalPaise };
}

/** ₹ formatting from paise. `compact` drops ".00" when whole rupees. */
export function inr(paise: number, opts?: { compact?: boolean }): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const rStr = rupees.toLocaleString("en-IN");
  const body = p === 0 && opts?.compact ? rStr : `${rStr}.${String(p).padStart(2, "0")}`;
  return `${negative ? "-" : ""}₹${body}`;
}

/** Indian digit grouping for large numbers (e.g. 1,23,456) */
export function inrShort(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)} Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)} L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export const IST_OFFSET_MIN = 330;

/** Start-of-today (IST) as epoch ms, offset by daysAgo. */
export function istDayStart(daysAgo = 0): Date {
  const d = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST_OFFSET_MIN * 60000 - daysAgo * 86400000);
}

/** Human label for an order type. */
export const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
  QR: "QR Order",
};

export const STATION_LABEL: Record<string, string> = {
  MAIN: "Main Kitchen",
  TANDOOR: "Tandoor",
  BEVERAGE: "Beverage Counter",
  DESSERT: "Dessert Station",
};

/** Split "Butter Chicken (Full) + Extra Raita" style display names */
export function lineDisplayName(name: string, variant?: string | null): string {
  return variant ? `${name} (${variant})` : name;
}
