/* Staff management + audit log */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit } from "@/lib/session";

export async function GET() {
  try {
    await requireRole(["OWNER", "MANAGER"]);
    const [staff, audits] = await Promise.all([
      db.staff.findMany({ orderBy: { createdAt: "asc" } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    ]);
    return NextResponse.json({
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active })),
      audits,
    });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER"]);
    const body = await req.json();
    if (!body.name?.trim() || !/^\d{4}$/.test(String(body.pin || ""))) throw new HttpError(400, "Name and 4-digit PIN are required");
    const dupe = await db.staff.findFirst({ where: { pin: body.pin } });
    if (dupe) throw new HttpError(400, "This PIN is already in use");
    const staff = await db.staff.create({ data: { name: body.name.trim(), role: body.role || "WAITER", pin: body.pin } });
    await logAudit(s.name, s.role, "STAFF_CREATED", `${staff.name} (${staff.role})`);
    return NextResponse.json({ id: staff.id });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER"]);
    const body = await req.json();
    const staff = await db.staff.findUnique({ where: { id: body.id } });
    if (!staff) throw new HttpError(404, "Staff not found");
    if (body.toggleActive) {
      if (staff.id === s.staffId) throw new HttpError(400, "You cannot deactivate yourself");
      await db.staff.update({ where: { id: staff.id }, data: { active: !staff.active } });
      await logAudit(s.name, s.role, "STAFF_UPDATED", `${staff.name} → ${!staff.active ? "active" : "inactive"}`);
      return NextResponse.json({ ok: true });
    }
    await db.staff.update({
      where: { id: staff.id },
      data: { name: body.name?.trim() || staff.name, role: body.role || staff.role, ...(body.pin && /^\d{4}$/.test(body.pin) ? { pin: body.pin } : {}) },
    });
    await logAudit(s.name, s.role, "STAFF_UPDATED", staff.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
