/* Public QR endpoints — customer menu, order placement, status, assistance.
   Server validates table + prices; customers never send prices. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/session";
import { computeBill, DEFAULT_TAX, lineDisplayName } from "@/lib/money";
import type { OrderDTO } from "@/lib/types";

async function publicMenu() {
  const [categories, items] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.menuItem.findMany({
      where: { available: true, category: { active: true } },
      include: { variants: { where: { available: true } }, addons: { where: { available: true } }, category: true },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    items: items.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      pricePaise: m.pricePaise,
      categoryId: m.categoryId,
      diet: m.diet,
      allergens: m.allergens,
      soldOut: m.soldOut,
      prepMinutes: m.prepMinutes,
      variants: m.variants.map((v) => ({ name: v.name, priceDeltaPaise: v.priceDeltaPaise })),
      addons: m.addons.map((a) => ({ name: a.name, pricePaise: a.pricePaise })),
    })),
  };
}

async function serializePublicOrder(o: {
  id: string; orderNo: string; status: string; totalPaise: number; subtotalPaise: number; taxPaise: number; discountPaise: number;
  createdAt: Date; billRequested: boolean; table?: { number: number } | null; items: { id: string; name: string; qty: number; status: string; variantName: string | null; notes: string | null }[];
}): Promise<OrderDTO & { etaMinutes: number }> {
  const remaining = o.items.filter((i) => i.status !== "SERVED").length;
  return {
    id: o.id,
    orderNo: o.orderNo,
    type: "QR",
    status: o.status,
    tableId: null,
    tableNumber: o.table?.number || null,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    discountReason: null,
    couponCode: null,
    servicePaise: 0,
    taxPaise: o.taxPaise,
    totalPaise: o.totalPaise,
    paymentStatus: "UNPAID",
    customerName: null,
    customerPhone: null,
    guestCount: null,
    createdVia: "QR",
    billRequested: o.billRequested,
    assistRequested: false,
    notes: null,
    createdAt: o.createdAt.toISOString(),
    completedAt: null,
    staffName: null,
    items: o.items.map((i) => ({
      id: i.id, name: i.name, qty: i.qty, unitPricePaise: 0, variantName: i.variantName, addonsJson: null,
      notes: i.notes, station: "", status: i.status, createdAt: o.createdAt.toISOString(), readyAt: null, servedAt: null,
    })),
    etaMinutes: Math.max(5, remaining * 4),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("kind") === "order") {
      const orderNo = searchParams.get("orderNo");
      if (!orderNo) throw new HttpError(400, "orderNo required");
      const o = await db.order.findUnique({ where: { orderNo }, include: { table: { select: { number: true } } } });
      if (!o || o.createdVia !== "QR") throw new HttpError(404, "Order not found");
      const items = await db.orderItem.findMany({ where: { orderId: o.id }, select: { id: true, name: true, qty: true, status: true, variantName: true, notes: true } });
      return NextResponse.json(await serializePublicOrder({ ...o, items }));
    }
    // default: menu (+ optional table validation)
    const tableNo = searchParams.get("table");
    let table: { id: string; number: number; zone: string } | null = null;
    if (tableNo) {
      const t = await db.table.findUnique({ where: { number: Number(tableNo) } });
      if (!t) throw new HttpError(404, `Table ${tableNo} not found — please ask our staff`);
      table = { id: t.id, number: t.number, zone: t.zone };
    }
    const menu = await publicMenu();
    const profileRow = await db.setting.findUnique({ where: { key: "profile" } });
    return NextResponse.json({ table, menu, profile: profileRow ? JSON.parse(profileRow.value) : {} });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "assist") {
      const orderNo = String(body.orderNo || "");
      const o = await db.order.findUnique({ where: { orderNo } });
      if (!o) throw new HttpError(404, "Order not found");
      await db.order.update({ where: { id: o.id }, data: { assistRequested: true, billRequested: body.bill ? true : o.billRequested } });
      return NextResponse.json({ ok: true });
    }

    // place order
    const tableNo = Number(body.tableNumber);
    const t = await db.table.findUnique({ where: { number: tableNo } });
    if (!t) throw new HttpError(400, "Invalid table. Please scan the QR code on your table again.");
    if (t.status === "INACTIVE") throw new HttpError(400, "This table is not currently in service");

    const incoming: { menuItemId: string; qty: number; variantName?: string; addons?: { name: string }[]; notes?: string }[] = body.items || [];
    if (!incoming.length) throw new HttpError(400, "Your cart is empty");

    const ids = [...new Set(incoming.map((i) => i.menuItemId))];
    const menu = await db.menuItem.findMany({ where: { id: { in: ids }, available: true }, include: { variants: true, addons: true } });
    const map = new Map(menu.map((m) => [m.id, m]));

    let subtotal = 0;
    const rows: { menuItemId: string; name: string; unitPricePaise: number; qty: number; variantName: string | null; addonsJson: string | null; notes: string | null; station: string }[] = [];
    for (const l of incoming) {
      const m = map.get(l.menuItemId);
      if (!m) throw new HttpError(400, "An item in your cart is no longer available. Please refresh the menu.");
      if (m.soldOut) throw new HttpError(400, `${m.name} just sold out. Please remove it to continue.`);
      const qty = Math.max(1, Math.min(20, Math.round(Number(l.qty) || 1)));
      let unit = m.pricePaise;
      let variantName: string | null = null;
      if (l.variantName) {
        const v = m.variants.find((x) => x.name === l.variantName && x.available);
        if (!v) throw new HttpError(400, `Please re-select the variant for ${m.name}`);
        unit += v.priceDeltaPaise;
        variantName = v.name;
      }
      const chosenAddons = (l.addons || []).map((a) => m.addons.find((x) => x.name === a.name)).filter(Boolean);
      for (const a of chosenAddons) unit += a!.pricePaise;
      subtotal += unit * qty;
      rows.push({
        menuItemId: m.id, name: m.name, unitPricePaise: unit, qty, variantName,
        addonsJson: chosenAddons.length ? JSON.stringify(chosenAddons.map((a) => ({ name: a!.name, pricePaise: a!.pricePaise }))) : null,
        notes: l.notes?.slice(0, 160) || null, station: m.station,
      });
    }

    // count existing open QR orders at this table to avoid duplicate spam
    const dupGuard = await db.order.count({
      where: { tableId: t.id, createdVia: "QR", status: { in: ["OPEN", "PREPARING", "READY"] }, createdAt: { gte: new Date(Date.now() - 60 * 1000) } },
    });
    if (dupGuard > 2) throw new HttpError(429, "Slow down a moment — your recent orders are being placed.");

    const taxRow = await db.setting.findUnique({ where: { key: "tax" } });
    const cfg = taxRow ? { ...DEFAULT_TAX, ...JSON.parse(taxRow.value) } : DEFAULT_TAX;
    const bill = computeBill(rows.map((r) => ({ qty: r.qty, unitPricePaise: r.unitPricePaise })), null, cfg);

    const count = await db.order.count();
    const orderNo = `VD-${String(count + 1).padStart(4, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo, type: "QR", tableId: t.id, status: "OPEN", ...bill,
          customerName: body.customerName?.slice(0, 60) || null,
          createdVia: "QR", notes: body.notes || null,
          items: { create: rows.map((r) => ({ ...r, status: "QUEUED" })) },
        },
      });
      await tx.table.update({ where: { id: t.id }, data: { status: "OCCUPIED", openedAt: created.createdAt } });
      return created;
    });
    void lineDisplayName;
    return NextResponse.json({ orderNo: order.orderNo });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
