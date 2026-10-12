/* Tables, floor state, reservations + table actions (open, transfer handled in orders) */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit } from "@/lib/session";
import type { TableDTO } from "@/lib/types";

export async function GET() {
  try {
    await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "INVENTORY"]);
    const tables = await db.table.findMany({
      orderBy: { number: "asc" },
      include: {
        orders: { where: { status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } }, orderBy: { createdAt: "desc" }, take: 1, include: { items: true } },
        reservations: { where: { status: "CONFIRMED", at: { gte: new Date(Date.now() - 3600e3) } }, orderBy: { at: "asc" } },
      },
    });
    const payload: TableDTO[] = tables.map((t) => {
      const open = t.orders[0];
      return {
        id: t.id,
        number: t.number,
        seats: t.seats,
        zone: t.zone,
        status: open ? "OCCUPIED" : t.status,
        guestCount: t.guestCount,
        openedAt: open ? open.createdAt.toISOString() : t.openedAt?.toISOString() || null,
        openOrderId: open?.id || null,
        openOrderNo: open?.orderNo || null,
        openOrderTotalPaise: open?.totalPaise || 0,
        openOrderItems: open ? open.items.reduce((s, i) => s + i.qty, 0) : 0,
        activeReservations: t.reservations.map((r) => ({ id: r.id, guestName: r.guestName, guestCount: r.guestCount, at: r.at.toISOString(), note: r.note })),
      };
    });
    return NextResponse.json(payload);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
    const body = await req.json();
    if (body.kind === "reservation") {
      if (!body.tableId || !body.guestName?.trim()) throw new HttpError(400, "Table and guest name are required");
      const at = new Date(body.at);
      if (isNaN(at.getTime())) throw new HttpError(400, "Invalid date/time");
      const r = await db.reservation.create({
        data: { tableId: body.tableId, guestName: body.guestName.trim(), phone: body.phone || null, guestCount: Number(body.guestCount) || 2, at, note: body.note || null },
      });
      await logAudit(s.name, s.role, "RESERVATION_CREATED", `${r.guestName} · ${new Date(at).toLocaleString("en-IN")}`);
      return NextResponse.json({ id: r.id });
    }
    // create table
    if (!Number.isInteger(body.number) || body.number <= 0) throw new HttpError(400, "Valid table number required");
    const exists = await db.table.findUnique({ where: { number: body.number } });
    if (exists) throw new HttpError(400, `Table ${body.number} already exists`);
    const t = await db.table.create({ data: { number: body.number, seats: Number(body.seats) || 4, zone: body.zone || "Indoor" } });
    await logAudit(s.name, s.role, "TABLE_CREATED", `Table ${t.number}`);
    return NextResponse.json({ id: t.id });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
    const body = await req.json();
    if (body.kind === "reservation-status") {
      await db.reservation.update({ where: { id: body.id }, data: { status: body.status } });
      await logAudit(s.name, s.role, "RESERVATION_UPDATED", `${body.id} → ${body.status}`);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "open-table") {
      const t = await db.table.findUnique({ where: { id: body.tableId } });
      if (!t) throw new HttpError(404, "Table not found");
      const open = await db.order.findFirst({ where: { tableId: t.id, status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } } });
      if (open) throw new HttpError(400, `Table ${t.number} already has order ${open.orderNo}`);
      await db.table.update({ where: { id: t.id }, data: { status: "OCCUPIED", guestCount: Number(body.guestCount) || null, openedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "free-table") {
      await db.table.update({ where: { id: body.tableId }, data: { status: "AVAILABLE", guestCount: null, openedAt: null } });
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "seat-reservation") {
      const r = await db.reservation.update({ where: { id: body.id }, data: { status: "SEATED" } });
      await db.table.update({ where: { id: r.tableId }, data: { status: "OCCUPIED", guestCount: r.guestCount, openedAt: new Date() } });
      await logAudit(s.name, s.role, "RESERVATION_SEATED", r.guestName);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action");
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
