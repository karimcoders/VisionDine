/* Payment — idempotent settlement. Deducts inventory exactly once. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit } from "@/lib/session";
import { buildReceipt } from "@/lib/receipt";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "CASHIER"]);
    const { id } = await ctx.params;
    const body = await req.json();
    const idemKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null;

    // Idempotency: same key already settled → return existing receipt silently.
    if (idemKey) {
      const existingPayment = await db.payment.findUnique({ where: { idempotencyKey: idemKey }, include: { order: { include: { items: true, table: true, payments: true, staff: true } } } });
      if (existingPayment?.order) {
        return NextResponse.json({ receipt: await buildReceipt(existingPayment.order), duplicate: true });
      }
    }

    const order = await db.order.findUnique({ where: { id }, include: { items: true, payments: true, table: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "CANCELLED") throw new HttpError(400, "Cannot pay a cancelled order");
    const alreadyPaid = order.payments.filter((p) => p.status === "SUCCESS").reduce((sum, p) => sum + p.amountPaise, 0);
    if (order.paymentStatus === "PAID" || alreadyPaid >= order.totalPaise) {
      const full = await db.order.findUnique({ where: { id }, include: { items: true, table: true, payments: true, staff: true } });
      return NextResponse.json({ receipt: full ? await buildReceipt(full) : null, duplicate: true });
    }
    const due = order.totalPaise - alreadyPaid;

    // Validate payment lines
    type Line = { method: string; amountPaise: number; reference?: string };
    const lines: Line[] = Array.isArray(body.payments) && body.payments.length
      ? body.payments.map((p: Line) => ({ method: String(p.method), amountPaise: Math.round(Number(p.amountPaise)), reference: p.reference || null }))
      : [{ method: String(body.method || "CASH"), amountPaise: due, reference: body.reference || null }];
    const total = lines.reduce((sum, l) => sum + l.amountPaise, 0);
    if (lines.some((l) => l.amountPaise <= 0)) throw new HttpError(400, "Payment amounts must be positive");
    if (total !== due) throw new HttpError(400, `Payment total (₹${(total / 100).toFixed(2)}) does not match due amount (₹${(due / 100).toFixed(2)})`);

    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      for (let i = 0; i < lines.length; i++) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            method: lines[i].method,
            amountPaise: lines[i].amountPaise,
            reference: lines[i].reference,
            status: "SUCCESS",
            idempotencyKey: idemKey ? (lines.length > 1 ? `${idemKey}:${i}` : idemKey) : null,
          },
        });
      }
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", status: "COMPLETED", completedAt: now } });

      // Inventory deduction — exactly once per order (guarded by SALE movements)
      const existingSaleMoves = await tx.stockMovement.count({ where: { orderRef: order.orderNo, type: "SALE" } });
      if (existingSaleMoves === 0) {
        const items = await tx.orderItem.findMany({ where: { orderId: order.id }, include: { menuItem: { include: { recipeLines: true } } } });
        for (const item of items) {
          if (!item.menuItem) continue;
          for (const rl of item.menuItem.recipeLines) {
            const delta = -(rl.qtyPerServing * item.qty);
            await tx.ingredient.update({ where: { id: rl.ingredientId }, data: { qty: { decrement: -delta } } });
            await tx.stockMovement.create({ data: { ingredientId: rl.ingredientId, type: "SALE", qtyDelta: delta, orderRef: order.orderNo, staffName: s.name } });
          }
        }
      }

      // Free the table when settled
      if (order.tableId) {
        await tx.table.update({ where: { id: order.tableId }, data: { status: "AVAILABLE", guestCount: null, openedAt: null } });
      }

      // Loyalty + customer stats
      if (order.customerPhone) {
        const cust = await tx.customer.findUnique({ where: { phone: order.customerPhone } });
        if (cust) {
          const loyaltyRow = await tx.setting.findUnique({ where: { key: "loyalty" } });
          const cfg = loyaltyRow ? JSON.parse(loyaltyRow.value) : { enabled: true, earnPerHundred: 2 };
          const points = cfg.enabled ? Math.floor(order.totalPaise / 10000) * (cfg.earnPerHundred || 2) : 0;
          await tx.customer.update({
            where: { id: cust.id },
            data: { visits: { increment: 1 }, totalSpentPaise: { increment: order.totalPaise }, loyaltyPoints: { increment: points } },
          });
        }
      }

      // Coupon usage
      if (order.couponCode && !order.couponCode.startsWith("MANUAL:")) {
        await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { usageCount: { increment: 1 } } });
      }

      return tx.order.findUnique({ where: { id: order.id }, include: { items: true, table: true, payments: true, staff: true } });
    });

    await logAudit(s.name, s.role, "PAYMENT_RECORDED", `${order.orderNo} · ${lines.map((l) => `${l.method} ₹${(l.amountPaise / 100).toFixed(0)}`).join(" + ")}`);
    return NextResponse.json({ receipt: result ? await buildReceipt(result) : null });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
