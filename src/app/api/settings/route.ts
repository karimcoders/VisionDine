/* Restaurant settings — profile, tax, receipt, hours, loyalty, coupons, QR data */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit, getSession } from "@/lib/session";
import type { SettingsDTO } from "@/lib/types";

const KEYS = ["profile", "tax", "receipt", "orderPrefix", "hours", "loyalty"] as const;

export async function GET() {
  try {
    await getSession();
    const rows = await db.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const map = new Map(rows.map((r) => [r.key, JSON.parse(r.value)]));
    const payload: SettingsDTO = {
      profile: map.get("profile") || { name: "VisionDine" },
      tax: map.get("tax") || { gstPercent: 5, taxInclusive: true, serviceChargePercent: 0 },
      receipt: map.get("receipt") || { footer: "" },
      orderPrefix: map.get("orderPrefix") || { prefix: "VD" },
      hours: map.get("hours") || { open: "11:00", close: "23:30", closedOn: "None" },
      loyalty: map.get("loyalty") || { enabled: true, earnPerHundred: 2 },
    };
    return NextResponse.json(payload);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER"]);
    const body = await req.json();
    const { key, value } = body;
    if (!KEYS.includes(key)) throw new HttpError(400, "Unknown settings key");
    await db.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) },
    });
    await logAudit(s.name, s.role, "SETTINGS_UPDATED", key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
