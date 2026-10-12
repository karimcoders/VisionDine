/* Kitchen Display — live tickets + item status transitions */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit } from "@/lib/session";

const ACTIVE = ["OPEN", "PREPARING", "READY", "SERVED"];

export async function GET() {
  try {
    await requireRole(["OWNER", "MANAGER", "KITCHEN", "CASHIER", "WAITER"]);
    const orders = await db.order.findMany({
      where: { status: { in: ACTIVE } },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        table: { select: { number: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const tickets = orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      type: o.type,
      tableNumber: o.table?.number || null,
      createdAt: o.createdAt.toISOString(),
      items: o.items
        .filter((i) => i.status !== "SERVED")
        .map((i) => ({
          id: i.id,
          name: i.name,
          qty: i.qty,
          variantName: i.variantName,
          notes: i.notes,
          station: i.station,
          status: i.status,
          createdAt: i.createdAt.toISOString(),
        })),
      allServed: o.items.every((i) => i.status === "SERVED"),
    })).filter((t) => t.items.length > 0);
    return NextResponse.json(tickets);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "KITCHEN", "CASHIER", "WAITER"]);
    const body = await req.json();

    if (body.action === "bump-order") {
      // Accept all queued items of the order into PREPARING (kitchen ack)
      const order = await db.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
      if (!order) throw new HttpError(404, "Order not found");
      await db.orderItem.updateMany({ where: { orderId: order.id, status: "QUEUED" }, data: { status: "PREPARING" } });
      await db.order.update({ where: { id: order.id }, data: { status: "PREPARING" } });
      return NextResponse.json({ ok: true });
    }

    const item = await db.orderItem.findUnique({ where: { id: body.itemId }, include: { order: true } });
    if (!item) throw new HttpError(404, "Item not found");
    const status = String(body.status);
    if (!["PREPARING", "READY", "SERVED"].includes(status)) throw new HttpError(400, "Invalid status");

    await db.orderItem.update({
      where: { id: item.id },
      data: { status, readyAt: status === "READY" ? new Date() : item.readyAt, servedAt: status === "SERVED" ? new Date() : item.servedAt },
    });

    // Recompute order status from item states (never auto-SERVE from kitchen)
    const siblings = await db.orderItem.findMany({ where: { orderId: item.orderId } });
    const allReady = siblings.every((i) => i.status === "READY" || i.status === "SERVED");
    const anyPrep = siblings.some((i) => i.status === "PREPARING" || i.status === "READY" || i.status === "SERVED");
    const newStatus = allReady ? "READY" : anyPrep ? "PREPARING" : item.order.status;
    if (item.order.status !== "COMPLETED" && item.order.status !== "CANCELLED" && item.order.status !== newStatus) {
      await db.order.update({ where: { id: item.orderId }, data: { status: newStatus } });
    }
    if (status === "READY") await logAudit(s.name, s.role, "ITEM_READY", `${item.order.orderNo} · ${item.name}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
