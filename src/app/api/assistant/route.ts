/* AI Restaurant Assistant — grounded strictly on live DB facts.
   The POS works fully without this. All numbers below are real records. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse } from "@/lib/session";
import { istDayStart, inr } from "@/lib/money";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireRole(["OWNER", "MANAGER", "CASHIER"]);
    const { question } = await req.json();
    const q = String(question || "").slice(0, 500);
    if (!q.trim()) return NextResponse.json({ error: "Ask a question first" }, { status: 400 });

    /* ---- gather real facts snapshot ---- */
    const todayStart = istDayStart(0);
    const weekStart = istDayStart(6);
    const [paidToday, orders7, liveOrders, ingredients, itemsToday, paymentsToday] = await Promise.all([
      db.order.findMany({ where: { status: "COMPLETED", completedAt: { gte: todayStart } } }),
      db.order.findMany({ where: { createdAt: { gte: weekStart }, status: "COMPLETED" }, include: { items: true } }),
      db.order.findMany({ where: { status: { in: ["OPEN", "PREPARING", "READY", "SERVED"] } }, include: { table: true } }),
      db.ingredient.findMany(),
      db.orderItem.findMany({ where: { order: { status: "COMPLETED", completedAt: { gte: todayStart } } } }),
      db.payment.findMany({ where: { createdAt: { gte: todayStart }, status: "SUCCESS" } }),
    ]);

    const netToday = paidToday.reduce((s, o) => s + o.totalPaise, 0);
    const ordersToday = paidToday.length;
    const itemMap = new Map<string, number>();
    for (const i of itemsToday) itemMap.set(i.name, (itemMap.get(i.name) || 0) + i.qty);
    const weekMap = new Map<string, number>();
    for (const o of orders7) for (const i of o.items) weekMap.set(i.name, (weekMap.get(i.name) || 0) + i.qty);

    const facts = {
      date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }),
      today: {
        netSales: inr(netToday),
        completedOrders: ordersToday,
        avgOrderValue: ordersToday ? inr(Math.round(netToday / ordersToday)) : "₹0",
        paymentSplit: Object.entries(paymentsToday.reduce<Record<string, number>>((acc, p) => { acc[p.method] = (acc[p.method] || 0) + p.amountPaise; return acc; }, {})).map(([m, v]) => `${m}: ${inr(v)}`),
        topDishesToday: [...itemMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, qty]) => `${n} ×${qty}`),
      },
      week: {
        completedOrders: orders7.length,
        netSales: inr(orders7.reduce((s, o) => s + o.totalPaise, 0)),
        topDishesThisWeek: [...weekMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, qty]) => `${n} ×${qty}`),
      },
      liveNow: {
        openOrders: liveOrders.length,
        preparing: liveOrders.filter((o) => o.status === "PREPARING").length,
        readyToServe: liveOrders.filter((o) => o.status === "READY").length,
        delayedOver20Min: liveOrders.filter((o) => Date.now() - o.createdAt.getTime() > 20 * 60000).map((o) => `${o.orderNo}${o.table ? ` (Table ${o.table.number})` : ""} — ${Math.round((Date.now() - o.createdAt.getTime()) / 60000)} min`),
        unpaidTotal: inr(liveOrders.reduce((s, o) => s + o.totalPaise, 0)),
      },
      inventory: {
        lowStock: ingredients.filter((i) => i.qty <= i.minQty).map((i) => `${i.name}: ${i.qty}${i.unit} (min ${i.minQty}${i.unit})`),
        expiringIn72h: ingredients.filter((i) => i.expiresAt && i.expiresAt.getTime() < Date.now() + 3 * 864e5).map((i) => `${i.name}: expires ${i.expiresAt!.toLocaleDateString("en-IN")}`),
      },
      notes: [
        "All figures above are computed from real order/payment/stock records.",
        "Sales figures are NET collected totals for completed (paid) orders; they are not profit.",
        "Demand forecasts are not available in this snapshot; if asked, clearly label any estimate as an estimate and explain its basis (this week's order counts).",
      ],
    };

    /* ---- LLM grounded answer ---- */
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are the VisionDine restaurant assistant for the owner/manager of an Indian restaurant. Answer ONLY from the JSON facts provided. Never invent numbers. If the facts don't contain the answer, say so plainly and suggest where to check (Reports, Inventory screens). The user may write in Hindi/Hinglish/English — reply in the same language style, warm and brief (2-5 sentences max, or short bullets). Currency is ₹ (INR). Never label sales as profit.\n\nFACTS_JSON:\n${JSON.stringify(facts)}`,
          },
          { role: "user", content: q },
        ],
      });
      const answer = completion?.choices?.[0]?.message?.content;
      if (!answer) throw new Error("Empty AI response");
      return NextResponse.json({ answer, groundedAt: new Date().toISOString() });
    } catch (aiErr) {
      // AI unavailable — provide deterministic fallback from the same facts
      console.error("[assistant] AI unavailable:", aiErr);
      const fallback = [
        `AI service is not reachable right now, so here are live figures from your records:`,
        `• Today: ${inr(netToday)} net from ${ordersToday} completed orders`,
        ordersToday ? `• Top seller today: ${[...itemMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—"}` : "",
        `• Running orders: ${liveOrders.length} · Low stock items: ${ingredients.filter((i) => i.qty <= i.minQty).length}`,
      ].filter(Boolean).join("\n");
      return NextResponse.json({ answer: fallback, degraded: true });
    }
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
