/* Reports & analytics — date-range aggregates from real transactions */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError } from "@/lib/session";
import { istDayStart } from "@/lib/money";
import type { AnalyticsDTO } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["OWNER", "MANAGER"]);
    const { searchParams } = new URL(req.url);
    const rangeDays = Math.min(Math.max(Number(searchParams.get("days")) || 7, 1), 90);
    const start = istDayStart(rangeDays - 1);

    const [orders, items, payments, refundsAgg] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: start }, status: { in: ["COMPLETED", "CANCELLED"] } },
        include: { items: { include: { menuItem: { include: { category: true } } } } },
      }),
      db.orderItem.findMany({ where: { order: { createdAt: { gte: start }, status: "COMPLETED" } }, include: { menuItem: { include: { category: true } } } }),
      db.payment.findMany({ where: { createdAt: { gte: start }, status: "SUCCESS" }, include: { order: true } }),
      db.refund.aggregate({ where: { createdAt: { gte: start } }, _sum: { amountPaise: true }, _count: true }),
    ]);

    const completed = orders.filter((o) => o.status === "COMPLETED");
    const cancelled = orders.filter((o) => o.status === "CANCELLED").length;
    const grossPaise = completed.reduce((s, o) => s + o.subtotalPaise, 0);
    const netPaise = completed.reduce((s, o) => s + o.totalPaise, 0);
    const taxPaise = completed.reduce((s, o) => s + o.taxPaise, 0);
    const discountsPaise = completed.reduce((s, o) => s + o.discountPaise, 0);

    // series
    const series: { date: string; netPaise: number; orders: number }[] = [];
    for (let d = rangeDays - 1; d >= 0; d--) {
      const s0 = istDayStart(d).getTime();
      const s1 = istDayStart(d - 1).getTime();
      const dayOrders = completed.filter((o) => {
        const t = (o.completedAt || o.createdAt).getTime();
        return t >= s0 && t < s1;
      });
      series.push({ date: new Date(s0).toISOString().slice(0, 10), netPaise: dayOrders.reduce((s, o) => s + o.totalPaise, 0), orders: dayOrders.length });
    }

    const payMap = new Map<string, number>();
    for (const p of payments) payMap.set(p.method, (payMap.get(p.method) || 0) + p.amountPaise);

    const typeMap = new Map<string, number>();
    for (const o of completed) typeMap.set(o.type, (typeMap.get(o.type) || 0) + 1);

    const itemMap = new Map<string, { qty: number; revenuePaise: number }>();
    const catMap = new Map<string, number>();
    for (const it of items) {
      const cur = itemMap.get(it.name) || { qty: 0, revenuePaise: 0 };
      cur.qty += it.qty;
      cur.revenuePaise += it.qty * it.unitPricePaise;
      itemMap.set(it.name, cur);
      const cn = it.menuItem?.category.name || "Other";
      catMap.set(cn, (catMap.get(cn) || 0) + it.qty * it.unitPricePaise);
    }

    // hourly pattern
    const hourly: { hour: number; orders: number; netPaise: number }[] = [];
    for (let h = 10; h <= 23; h++) {
      const hs = completed.filter((o) => ((o.createdAt.getTime() + 330 * 60000) / 3600000) % 24 >= h && ((o.createdAt.getTime() + 330 * 60000) / 3600000) % 24 < h + 1);
      hourly.push({ hour: h, orders: hs.length, netPaise: hs.reduce((s, o) => s + o.totalPaise, 0) });
    }

    // slow movers: menu items with zero sales in range
    const allMenu = await db.menuItem.findMany({ select: { name: true } });
    const soldNames = new Set([...itemMap.keys()]);
    const slowItems = allMenu.filter((m) => !soldNames.has(m.name)).slice(0, 10).map((m) => ({ name: m.name, qty: 0 }));

    const payload: AnalyticsDTO = {
      rangeDays,
      series,
      totals: { netPaise, grossPaise, taxPaise, discountsPaise, orders: completed.length, aovPaise: completed.length ? Math.round(netPaise / completed.length) : 0 },
      paymentMix: [...payMap.entries()].map(([method, amountPaise]) => ({ method, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
      typeMix: [...typeMap.entries()].map(([type, count]) => ({ type, orders: count })),
      topItems: [...itemMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 10),
      slowItems,
      categorySales: [...catMap.entries()].map(([name, amountPaise]) => ({ name, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
      hourly,
      refunds: { count: refundsAgg._count || 0, amountPaise: refundsAgg._sum.amountPaise || 0 },
      cancelled,
    };
    void items; void HttpError;
    return NextResponse.json(payload);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
