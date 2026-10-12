/* Receipt / KOT retrieval for any order */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, errorResponse, HttpError } from "@/lib/session";
import { buildReceipt } from "@/lib/receipt";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await getSession();
    const { id } = await ctx.params;
    const order = await db.order.findUnique({ where: { id }, include: { items: true, table: true, payments: true, staff: true } });
    if (!order) throw new HttpError(404, "Order not found");
    return NextResponse.json(await buildReceipt(order));
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
