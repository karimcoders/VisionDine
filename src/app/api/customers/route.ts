/* Customers + loyalty */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const customers = await db.customer.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : undefined,
      orderBy: { totalSpentPaise: "desc" },
      take: 100,
    });
    return NextResponse.json(customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, loyaltyPoints: c.loyaltyPoints, visits: c.visits, totalSpentPaise: c.totalSpentPaise, createdAt: c.createdAt.toISOString() })));
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
    const body = await req.json();
    if (!body.name?.trim() || !/^\d{10}$/.test(String(body.phone || ""))) throw new HttpError(400, "Name and 10-digit phone are required");
    const dupe = await db.customer.findUnique({ where: { phone: body.phone } });
    if (dupe) throw new HttpError(400, "A customer with this phone already exists");
    const c = await db.customer.create({ data: { name: body.name.trim(), phone: body.phone } });
    await logAudit(s.name, s.role, "CUSTOMER_CREATED", c.name);
    return NextResponse.json({ id: c.id });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
