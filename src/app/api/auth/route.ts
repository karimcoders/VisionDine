import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, makeToken, SESSION_COOKIE, errorResponse, HttpError, logAudit } from "@/lib/session";
import type { Role } from "@/lib/session";

export async function GET() {
  try {
    const s = await getSession();
    if (!s) return NextResponse.json({ auth: null });
    const staff = await db.staff.findUnique({ where: { id: s.staffId } });
    if (!staff || !staff.active) {
      const res = NextResponse.json({ auth: null });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.json({ auth: { staffId: staff.id, name: staff.name, role: staff.role as Role } });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    if (body.action === "verify-manager") {
      const pin = String(body.pin || "").trim();
      const staff = await db.staff.findFirst({ where: { pin, active: true, role: { in: ["OWNER", "MANAGER"] } } });
      return NextResponse.json({ valid: !!staff, name: staff?.name || null });
    }
    // login via PIN
    const pin = String(body.pin || "").trim();
    if (!/^\d{4}$/.test(pin)) throw new HttpError(400, "Enter a 4-digit PIN");
    const staff = await db.staff.findFirst({ where: { pin, active: true } });
    if (!staff) throw new HttpError(401, "Invalid PIN. Try again.");
    const token = makeToken({ staffId: staff.id, name: staff.name, role: staff.role as Role, ts: Date.now() });
    await logAudit(staff.name, staff.role, "LOGIN", "Staff signed in");
    const res = NextResponse.json({
      auth: { staffId: staff.id, name: staff.name, role: staff.role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 3600,
    });
    return res;
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
