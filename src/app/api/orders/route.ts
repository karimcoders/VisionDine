/* Orders — create, list, and actions (add items, discount, transfer, merge, cancel, serve) */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit, authorizeManagerPin, getSession } from "@/lib/session";
import type { Role } from "@/lib/session";
import { computeBill, DEFAULT_TAX } from "@/lib/money";
import type { OrderDTO } from "@/lib/types";

async function getTaxConfig() {
  const row = await db.setting.findUnique({ where: { key: "tax" } });
  if (!row) return DEFAULT_TAX;
  return { ...DEFAULT_TAX, ...JSON.parse(row.value) };
}

async function nextOrderNo(): Promise<string> {
  const prefixRow = await db.setting.findUnique({ where: { key: "orderPrefix" } });
  const prefix = prefixRow ? (JSON.parse(prefixRow.value).prefix || "VD") : "VD";
  const count = await db.order.count();
  for (let i = 1; i <= 50; i++) {
    const candidate = `${prefix}-${String(count + i).padStart(4, "0")}`;
    const exists = await db.order.findUnique({ where: { orderNo: candidate } });
    if (!exists) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function serialize(o: any): OrderDTO {
  return {
    id: o.id,
    orderNo: o.orderNo,
    type: o.type,
    status: o.status,
    tableId: o.tableId || null,
    tableNumber: o.table?.number || null,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    discountReason: o.discountReason || null,
    couponCode: o.couponCode || null,
    servicePaise: o.servicePaise,
    taxPaise: o.taxPaise,
    totalPaise: o.totalPaise,
    paymentStatus: o.paymentStatus,
    customerName: o.customerName || null,
    customerPhone: o.customerPhone || null,
    guestCount: o.guestCount || null,
    createdVia: o.createdVia,
    billRequested: o.billRequested,
    assistRequested: o.assistRequested,
    notes: o.notes || null,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt?.toISOString() || null,
    staffName: o.staff?.name || null,
    items: o.items || [],
    payments: o.payments || [],
  };
}

const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: "asc" as const } },
  table: { select: { number: true } },
  staff: { select: { name: true } },
  payments: { orderBy: { createdAt: "asc" as const } },
};

export async function GET(req: NextRequest) {
  try {
    await getSession();
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "active";
    const limit = Math.min(Number(searchParams.get("limit")) || 60, 200);
    let where = {};
    if (scope === "active") where = { status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } };
    else if (scope === "completed") where = { status: { in: ["COMPLETED", "CANCELLED"] } };
    else if (scope === "unpaid") where = { paymentStatus: "UNPAID", status: { notIn: ["CANCELLED"] } };
    if (searchParams.get("tableId")) where = { ...where, tableId: searchParams.get("tableId") as string };
    const orders = await db.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: limit });
    return NextResponse.json(orders.map((o) => serialize(o)));
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

type IncomingLine = { menuItemId: string; qty: number; variantName?: string | null; addons?: { name: string; pricePaise: number }[]; notes?: string };

async function buildItemRows(lines: IncomingLine[]) {
  if (!lines?.length) throw new HttpError(400, "Add at least one item");
  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  const menu = await db.menuItem.findMany({ where: { id: { in: ids } }, include: { variants: true } });
  const map = new Map(menu.map((m) => [m.id, m]));
  const rows: { menuItemId: string; name: string; unitPricePaise: number; qty: number; variantName: string | null; addonsJson: string | null; notes: string | null; station: string }[] = [];
  for (const l of lines) {
    const m = map.get(l.menuItemId);
    if (!m) throw new HttpError(400, "One of the items no longer exists");
    if (!m.available) throw new HttpError(400, `${m.name} is currently unavailable`);
    if (m.soldOut) throw new HttpError(400, `${m.name} is sold out`);
    const qty = Math.max(1, Math.round(Number(l.qty) || 1));
    let unit = m.pricePaise;
    if (l.variantName) {
      const v = m.variants.find((x) => x.name === l.variantName && x.available);
      if (!v) throw new HttpError(400, `Variant "${l.variantName}" is not available for ${m.name}`);
      unit += v.priceDeltaPaise;
    }
    const addons = (l.addons || []).filter((a) => a?.name);
    for (const a of addons) unit += Math.max(0, Math.round(a.pricePaise) || 0);
    rows.push({
      menuItemId: m.id,
      name: m.name,
      unitPricePaise: unit,
      qty,
      variantName: l.variantName || null,
      addonsJson: addons.length ? JSON.stringify(addons) : null,
      notes: l.notes?.slice(0, 200) || null,
      station: m.station,
    });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
    const body = await req.json();
    const rows = await buildItemRows(body.items || []);
    const cfg = await getTaxConfig();
    const bill = computeBill(rows.map((r) => ({ qty: r.qty, unitPricePaise: r.unitPricePaise })), null, cfg);

    let tableId = body.tableId || null;
    if (body.type === "DINE_IN" && !tableId) throw new HttpError(400, "Select a table for dine-in");
    if (tableId) {
      const table = await db.table.findUnique({ where: { id: tableId } });
      if (!table) throw new HttpError(400, "Table not found");
      const open = await db.order.findFirst({ where: { tableId, status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } } });
      if (open) throw new HttpError(400, `Table ${table.number} already has open order ${open.orderNo}. Add items to it instead.`);
    }

    const orderNo = await nextOrderNo();
    const order = await db.order.create({
      data: {
        orderNo,
        type: body.type || "DINE_IN",
        tableId,
        status: "OPEN",
        ...bill,
        customerName: body.customerName || null,
        customerPhone: body.customerPhone || null,
        guestCount: body.guestCount ? Number(body.guestCount) : null,
        staffId: s.staffId,
        createdVia: body.via === "QR" ? "QR" : "POS",
        notes: body.notes || null,
        items: { create: rows.map((r) => ({ ...r, status: "QUEUED" })) },
      },
      include: ORDER_INCLUDE,
    });
    if (tableId) {
      await db.table.update({ where: { id: tableId }, data: { status: "OCCUPIED", openedAt: body.keepOpenedAt ? new Date(body.keepOpenedAt) : undefined, guestCount: body.guestCount ? Number(body.guestCount) : undefined } });
    }
    await logAudit(s.name, s.role, "ORDER_CREATED", `${order.orderNo} · ${rows.length} items · ₹${(bill.totalPaise / 100).toFixed(0)}`);
    return NextResponse.json(serialize(order));
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await getSession();
    if (!s) throw new HttpError(401, "Sign in required");
    const body = await req.json();
    const orderId = body.orderId as string;
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, table: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new HttpError(400, "This order is closed");

    const staffRoles: Role[] = ["OWNER", "MANAGER", "CASHIER", "WAITER"];
    const canOrder = staffRoles.includes(s.role) || (s.role === "KITCHEN" && body.action === "mark-served");

    switch (body.action) {
      case "add-items": {
        if (!staffRoles.includes(s.role)) throw new HttpError(403, "Not allowed");
        const rows = await buildItemRows(body.items || []);
        const cfg = await getTaxConfig();
        const allLines = [
          ...order.items.map((i) => ({ qty: i.qty, unitPricePaise: i.unitPricePaise })),
          ...rows.map((r) => ({ qty: r.qty, unitPricePaise: r.unitPricePaise })),
        ];
        const discount = order.discountPaise > 0 ? { kind: (order.couponCode?.startsWith("PERCENT:") ? "PERCENT" : "FLAT") as "PERCENT" | "FLAT", value: order.discountPaise } : null;
        const bill = computeBill(allLines, discount, cfg);
        await db.orderItem.createMany({ data: rows.map((r) => ({ ...r, orderId: order.id, status: "QUEUED" })) });
        await db.order.update({
          where: { id: order.id },
          data: { ...bill, status: order.status === "OPEN" ? "PREPARING" : order.status === "READY" ? "PREPARING" : order.status },
        });
        await logAudit(s.name, s.role, "ITEMS_ADDED", `${order.orderNo} · +${rows.length} items`);
        break;
      }
      case "discount": {
        if (!staffRoles.includes(s.role)) throw new HttpError(403, "Not allowed");
        const reason = String(body.reason || "").trim();
        if (!reason) throw new HttpError(400, "Discount reason is required");
        // Manager authorization: either caller is OWNER/MANAGER or supplies a manager PIN
        let authorizer = s.name;
        if (!["OWNER", "MANAGER"].includes(s.role)) {
          const mgr = await authorizeManagerPin(String(body.managerPin || ""));
          authorizer = mgr.name;
        }
        const kind = body.kind === "PERCENT" ? "PERCENT" : "FLAT";
        const value = Math.max(0, Math.round(Number(body.value) || 0));
        if (kind === "PERCENT" && value > 100) throw new HttpError(400, "Percent cannot exceed 100");
        const cfg = await getTaxConfig();
        const bill = computeBill(order.items.map((i) => ({ qty: i.qty, unitPricePaise: i.unitPricePaise })), { kind, value }, cfg);
        await db.order.update({
          where: { id: order.id },
          data: { discountPaise: bill.discountPaise, discountReason: `${reason} · by ${authorizer}`, couponCode: `MANUAL:${kind}:${value}`, ...bill },
        });
        await logAudit(authorizer, "MANAGER", "DISCOUNT_APPLIED", `${order.orderNo} · ${reason} · ${kind === "PERCENT" ? value + "%" : `₹${(value / 100).toFixed(0)}`}`);
        break;
      }
      case "apply-coupon": {
        if (!staffRoles.includes(s.role)) throw new HttpError(403, "Not allowed");
        const code = String(body.code || "").trim().toUpperCase();
        const coupon = await db.coupon.findUnique({ where: { code } });
        if (!coupon || !coupon.active) throw new HttpError(400, "Invalid or expired coupon");
        const subtotal = order.items.reduce((sum, i) => sum + i.qty * i.unitPricePaise, 0);
        if (subtotal < coupon.minOrderPaise) throw new HttpError(400, `Minimum order for ${code} is ₹${(coupon.minOrderPaise / 100).toFixed(0)}`);
        const cfg = await getTaxConfig();
        const bill = computeBill(order.items.map((i) => ({ qty: i.qty, unitPricePaise: i.unitPricePaise })), { kind: coupon.kind as "PERCENT" | "FLAT", value: coupon.value }, cfg);
        await db.order.update({ where: { id: order.id }, data: { discountPaise: bill.discountPaise, discountReason: `Coupon ${code}`, couponCode: code, ...bill } });
        await logAudit(s.name, s.role, "COUPON_APPLIED", `${order.orderNo} · ${code}`);
        break;
      }
      case "transfer": {
        if (!staffRoles.includes(s.role)) throw new HttpError(403, "Not allowed");
        const toTable = await db.table.findUnique({ where: { id: body.toTableId } });
        if (!toTable) throw new HttpError(400, "Target table not found");
        const busy = await db.order.findFirst({ where: { tableId: toTable.id, status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] }, id: { not: order.id } } });
        if (busy) throw new HttpError(400, `Table ${toTable.number} already has open order ${busy.orderNo}`);
        await db.order.update({ where: { id: order.id }, data: { tableId: toTable.id } });
        await db.table.update({ where: { id: toTable.id }, data: { status: "OCCUPIED", guestCount: order.guestCount, openedAt: order.createdAt } });
        if (order.tableId) await db.table.update({ where: { id: order.tableId }, data: { status: "AVAILABLE", guestCount: null, openedAt: null } });
        await logAudit(s.name, s.role, "ORDER_TRANSFERRED", `${order.orderNo} → Table ${toTable.number}`);
        break;
      }
      case "merge": {
        if (!["OWNER", "MANAGER", "CASHIER"].includes(s.role)) throw new HttpError(403, "Not allowed");
        const target = await db.order.findUnique({ where: { id: body.targetOrderId }, include: { items: true } });
        if (!target) throw new HttpError(404, "Target order not found");
        if (["COMPLETED", "CANCELLED"].includes(target.status)) throw new HttpError(400, "Target order is closed");
        await db.orderItem.updateMany({ where: { orderId: order.id }, data: { orderId: target.id } });
        const cfg = await getTaxConfig();
        const discount = target.discountPaise > 0 ? { kind: (target.couponCode?.startsWith("MANUAL:PERCENT") ? "PERCENT" : "FLAT") as "PERCENT" | "FLAT", value: target.discountPaise } : null;
        const bill = computeBill([...target.items.map((i) => ({ qty: i.qty, unitPricePaise: i.unitPricePaise })), ...order.items.map((i) => ({ qty: i.qty, unitPricePaise: i.unitPricePaise }))], discount, cfg);
        await db.order.update({ where: { id: target.id }, data: { ...bill, notes: [target.notes, `Merged ${order.orderNo}`].filter(Boolean).join(" · ") } });
        await db.order.delete({ where: { id: order.id } });
        await logAudit(s.name, s.role, "ORDERS_MERGED", `${order.orderNo} → ${target.orderNo}`);
        break;
      }
      case "refund": {
        if (["OWNER", "MANAGER"].includes(s.role)) {
          await logAudit(s.name, s.role, "ORDER_REFUNDED", `${order.orderNo} · ${body.reason || "no reason"}`);
        } else {
          const mgr = await authorizeManagerPin(String(body.managerPin || ""));
          await logAudit(mgr.name, mgr.role, "ORDER_REFUNDED", `${order.orderNo} · ${body.reason || "no reason"}`);
        }
        if (!body.reason?.trim()) throw new HttpError(400, "Refund reason is required");
        if (order.paymentStatus !== "PAID") throw new HttpError(400, "Only paid orders can be refunded");
        await db.refund.create({ data: { orderId: order.id, amountPaise: order.totalPaise, reason: body.reason.trim(), staffName: s.name } });
        await db.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED", status: "CANCELLED", notes: `${order.notes ? order.notes + " · " : ""}Refunded: ${body.reason}` } });
        break;
      }
      case "cancel": {
        if (!["OWNER", "MANAGER"].includes(s.role)) {
          const mgr = await authorizeManagerPin(String(body.managerPin || ""));
          await logAudit(mgr.name, mgr.role, "ORDER_CANCELLED", `${order.orderNo} · ${body.reason || "no reason"}`);
        } else {
          await logAudit(s.name, s.role, "ORDER_CANCELLED", `${order.orderNo} · ${body.reason || "no reason"}`);
        }
        if (!body.reason?.trim()) throw new HttpError(400, "Cancellation reason is required");
        await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED", notes: `${order.notes ? order.notes + " · " : ""}Cancelled: ${body.reason}` } });
        if (order.tableId) {
          const stillOpen = await db.order.findFirst({ where: { tableId: order.tableId, status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } } });
          if (!stillOpen) await db.table.update({ where: { id: order.tableId }, data: { status: "AVAILABLE", guestCount: null, openedAt: null } });
        }
        break;
      }
      case "mark-served": {
        if (!["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN"].includes(s.role)) throw new HttpError(403, "Not allowed");
        await db.orderItem.updateMany({ where: { orderId: order.id, status: { in: ["QUEUED", "PREPARING", "READY"] } }, data: { status: "SERVED", servedAt: new Date() } });
        await db.order.update({ where: { id: order.id }, data: { status: "SERVED" } });
        break;
      }
      case "request-bill": {
        if (!["OWNER", "MANAGER", "CASHIER", "WAITER"].includes(s.role)) throw new HttpError(403, "Not allowed");
        await db.order.update({ where: { id: order.id }, data: { billRequested: !!body.value } });
        break;
      }
      case "settle-assist": {
        await db.order.update({ where: { id: order.id }, data: { assistRequested: false, billRequested: body.bill ? true : order.billRequested } });
        break;
      }
      case "set-guests": {
        if (!staffRoles.includes(s.role)) throw new HttpError(403, "Not allowed");
        await db.order.update({ where: { id: order.id }, data: { guestCount: Number(body.guestCount) || null } });
        if (order.tableId) await db.table.update({ where: { id: order.tableId }, data: { guestCount: Number(body.guestCount) || null } });
        break;
      }
      default:
        throw new HttpError(400, "Unknown action");
    }
    const updated = await db.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    return NextResponse.json(updated ? serialize(updated) : { ok: true, merged: body.action === "merge" });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
