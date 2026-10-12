/* Dashboard — every figure computed from stored records (IST day boundaries) */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse } from "@/lib/session";
import { istDayStart } from "@/lib/money";
import type { DashboardDTO } from "@/lib/types";

export async function GET() {
  try {
    await requireRole(["OWNER", "MANAGER", "CASHIER"]);
    const todayStart = istDayStart(0);
    const yestStart = istDayStart(1);
    const weekStart = istDayStart(6);

    const [paidToday, cancelledToday, paidYesterday, paymentsToday, itemsToday, orders7, liveOrders, ingredients, movements7, activeTables, staffToday, reservationsToday] = await Promise.all([
      db.order.findMany({ where: { status: "COMPLETED", completedAt: { gte: todayStart } }, include: { items: { include: { menuItem: { include: { category: true } } } }, payments: true } }),
      db.order.count({ where: { status: "CANCELLED", createdAt: { gte: todayStart } } }),
      db.order.aggregate({ where: { status: "COMPLETED", completedAt: { gte: yestStart, lt: todayStart } }, _sum: { totalPaise: true } }),
      db.payment.findMany({ where: { createdAt: { gte: todayStart }, status: "SUCCESS" } }),
      db.orderItem.findMany({ where: { order: { status: "COMPLETED", completedAt: { gte: todayStart } } }, include: { menuItem: { include: { category: true } } } }),
      db.order.findMany({ where: { createdAt: { gte: weekStart }, status: { in: ["COMPLETED", "CANCELLED"] } }, select: { createdAt: true, status: true, totalPaise: true, completedAt: true } }),
      db.order.findMany({ where: { status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } }, include: { items: true, table: true } }),
      db.ingredient.findMany(),
      db.stockMovement.findMany({ where: { type: "WASTAGE", createdAt: { gte: weekStart } }, include: { ingredient: true } }),
      db.table.findMany(),
      db.order.findMany({ where: { createdAt: { gte: todayStart }, staffId: { not: null } }, include: { staff: true } }),
      db.reservation.count({ where: { status: "CONFIRMED", at: { gte: todayStart } } }),
    ]);

    const grossToday = paidToday.reduce((s, o) => s + o.subtotalPaise, 0);
    const netToday = paidToday.reduce((s, o) => s + o.totalPaise, 0);
    const refundsToday = 0; // refunds recorded via Refund records below (7d)

    // payment mix (today, successful payments)
    const payMap = new Map<string, number>();
    for (const p of paymentsToday) payMap.set(p.method, (payMap.get(p.method) || 0) + p.amountPaise);

    // category sales (today)
    const catMap = new Map<string, number>();
    for (const it of itemsToday) {
      const cname = it.menuItem?.category.name || "Other";
      catMap.set(cname, (catMap.get(cname) || 0) + it.qty * it.unitPricePaise);
    }

    // top items (today, by qty)
    const itemMap = new Map<string, { qty: number; revenuePaise: number }>();
    for (const it of itemsToday) {
      const cur = itemMap.get(it.name) || { qty: 0, revenuePaise: 0 };
      cur.qty += it.qty;
      cur.revenuePaise += it.qty * it.unitPricePaise;
      itemMap.set(it.name, cur);
    }

    // 7-day series (IST days)
    const series: { date: string; netPaise: number; orders: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const start = istDayStart(d).getTime();
      const end = istDayStart(d - 1).getTime();
      const dayOrders = orders7.filter((o) => {
        const t = (o.completedAt || o.createdAt).getTime();
        return t >= start && t < end && o.status === "COMPLETED";
      });
      series.push({
        date: new Date(start).toISOString().slice(0, 10),
        netPaise: dayOrders.reduce((s, o) => s + o.totalPaise, 0),
        orders: dayOrders.length,
      });
    }

    // prep time average (today, items with readyAt)
    const prepTimes = itemsToday.filter((i) => i.readyAt).map((i) => (i.readyAt!.getTime() - i.createdAt.getTime()) / 60000);
    const avgPrepMin = prepTimes.length ? Math.round(prepTimes.reduce((s, m) => s + m, 0) / prepTimes.length) : null;

    // live
    const open = liveOrders.filter((o) => o.status === "OPEN").length;
    const preparing = liveOrders.filter((o) => o.status === "PREPARING").length;
    const ready = liveOrders.filter((o) => o.status === "READY").length;
    const unpaidTotalPaise = liveOrders.reduce((s, o) => s + o.totalPaise, 0);

    // low stock + expiry
    const lowStock = ingredients.filter((i) => i.qty <= i.minQty).map((i) => ({ name: i.name, qty: i.qty, minQty: i.minQty, unit: i.unit }));
    const expiring = ingredients
      .filter((i) => i.expiresAt && i.expiresAt.getTime() < Date.now() + 3 * 864e5)
      .map((i) => ({ name: i.name, expiresAt: i.expiresAt!.toISOString(), qty: i.qty, unit: i.unit }));

    // wastage value 7d + refunds 7d
    const wastage7dPaise = Math.round(movements7.reduce((s, m) => s + Math.abs(m.qtyDelta) * m.ingredient.costPerUnitPaise, 0));
    const refundsAgg = await db.refund.aggregate({ where: { createdAt: { gte: weekStart } }, _sum: { amountPaise: true }, _count: true });
    const refunds7dPaise = refundsAgg._sum.amountPaise || 0;

    // delayed orders (kitchen > 20 min, still not served)
    const delayedOrders = liveOrders
      .filter((o) => Date.now() - o.createdAt.getTime() > 20 * 60000)
      .map((o) => ({ orderNo: o.orderNo, tableNumber: o.table?.number || null, minutes: Math.round((Date.now() - o.createdAt.getTime()) / 60000) }));

    // table utilization
    const busy = activeTables.filter((t) => t.status === "OCCUPIED").length;
    const usable = activeTables.filter((t) => t.status !== "INACTIVE").length || 1;

    // staff activity (today)
    const staffMap = new Map<string, { name: string; role: string; orders: number }>();
    for (const o of staffToday) {
      if (!o.staff) continue;
      const cur = staffMap.get(o.staff.id) || { name: o.staff.name, role: o.staff.role, orders: 0 };
      cur.orders += 1;
      staffMap.set(o.staff.id, cur);
    }

    const payload: DashboardDTO = {
      today: {
        grossPaise: grossToday,
        netPaise: netToday,
        orders: paidToday.length,
        aovPaise: paidToday.length ? Math.round(netToday / paidToday.length) : 0,
        guests: paidToday.reduce((s, o) => s + (o.guestCount || 0), 0),
      },
      yesterdayNetPaise: paidYesterday._sum.totalPaise || 0,
      paymentMix: [...payMap.entries()].map(([method, amountPaise]) => ({ method, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
      categorySales: [...catMap.entries()].map(([name, amountPaise]) => ({ name, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
      topItems: [...itemMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 8),
      series,
      live: { open, preparing, ready, unpaidTotalPaise },
      lowStock,
      expiring,
      wastage7dPaise,
      refunds7dPaise,
      avgPrepMin,
      delayedOrders,
      tablesBusyPct: Math.round((busy / usable) * 100),
      staffActive: [...staffMap.values()].sort((a, b) => b.orders - a.orders),
    };
    void cancelledToday; void refundsToday; void reservationsToday;
    return NextResponse.json(payload);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
