/* Inventory — ingredients, purchases, wastage, adjustments, movement history */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit, getSession } from "@/lib/session";
import type { IngredientDTO, MovementDTO } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["OWNER", "MANAGER", "INVENTORY"]);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("movements")) || 80, 300);
    const [ingredients, movements] = await Promise.all([
      db.ingredient.findMany({ orderBy: { name: "asc" } }),
      db.stockMovement.findMany({ include: { ingredient: true }, orderBy: { createdAt: "desc" }, take: limit }),
    ]);
    const ing: IngredientDTO[] = ingredients.map((i) => ({
      id: i.id, name: i.name, unit: i.unit, qty: i.qty, minQty: i.minQty,
      costPerUnitPaise: i.costPerUnitPaise, supplier: i.supplier, location: i.location,
      expiresAt: i.expiresAt?.toISOString() || null,
    }));
    const movs: MovementDTO[] = movements.map((m) => ({
      id: m.id, ingredientId: m.ingredientId, ingredientName: m.ingredient.name, unit: m.ingredient.unit,
      type: m.type, qtyDelta: m.qtyDelta, reason: m.reason, orderRef: m.orderRef, staffName: m.staffName,
      createdAt: m.createdAt.toISOString(),
    }));
    return NextResponse.json({ ingredients: ing, movements: movs });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "INVENTORY"]);
    const body = await req.json();

    if (body.kind === "ingredient") {
      if (!body.name?.trim()) throw new HttpError(400, "Ingredient name is required");
      const i = await db.ingredient.create({
        data: {
          name: body.name.trim(), unit: body.unit || "KG", qty: Number(body.qty) || 0,
          minQty: Number(body.minQty) || 0, costPerUnitPaise: Math.round(Number(body.costPerUnitPaise) || 0),
          supplier: body.supplier || null, location: body.location || null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      if (i.qty > 0) {
        await db.stockMovement.create({ data: { ingredientId: i.id, type: "ADJUSTMENT", qtyDelta: i.qty, reason: "Opening stock", staffName: s.name } });
      }
      await logAudit(s.name, s.role, "INGREDIENT_CREATED", `${i.name} · ${i.qty} ${i.unit}`);
      return NextResponse.json({ id: i.id });
    }

    const ing = await db.ingredient.findUnique({ where: { id: body.ingredientId } });
    if (!ing) throw new HttpError(404, "Ingredient not found");

    if (body.kind === "purchase") {
      const qty = Number(body.qty);
      if (!qty || qty <= 0) throw new HttpError(400, "Quantity must be positive");
      await db.$transaction(async (tx) => {
        await tx.ingredient.update({ where: { id: ing.id }, data: { qty: { increment: qty }, supplier: body.supplier || ing.supplier } });
        await tx.stockMovement.create({ data: { ingredientId: ing.id, type: "PURCHASE", qtyDelta: qty, reason: body.reason || "Stock received", staffName: s.name } });
      });
      await logAudit(s.name, s.role, "STOCK_PURCHASED", `${ing.name} +${qty} ${ing.unit}`);
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "wastage" || body.kind === "adjustment") {
      const qty = Number(body.qty);
      if (!Number.isFinite(qty) || qty === 0) throw new HttpError(400, "Enter a quantity");
      const delta = body.kind === "wastage" ? -Math.abs(qty) : qty;
      const newQty = ing.qty + delta;
      if (newQty < 0) throw new HttpError(400, `Only ${ing.qty.toFixed(2)} ${ing.unit} in stock`);
      await db.$transaction(async (tx) => {
        await tx.ingredient.update({ where: { id: ing.id }, data: { qty: newQty } });
        await tx.stockMovement.create({
          data: { ingredientId: ing.id, type: body.kind === "wastage" ? "WASTAGE" : "ADJUSTMENT", qtyDelta: delta, reason: body.reason || (body.kind === "wastage" ? "Wastage" : "Manual adjustment"), staffName: s.name },
        });
      });
      await logAudit(s.name, s.role, body.kind === "wastage" ? "STOCK_WASTAGE" : "STOCK_ADJUSTED", `${ing.name} ${delta > 0 ? "+" : ""}${delta.toFixed(2)} ${ing.unit} · ${body.reason || ""}`);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action");
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "INVENTORY"]);
    const body = await req.json();
    const ing = await db.ingredient.findUnique({ where: { id: body.id } });
    if (!ing) throw new HttpError(404, "Ingredient not found");
    await db.ingredient.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() || ing.name,
        unit: body.unit || ing.unit,
        minQty: body.minQty !== undefined ? Number(body.minQty) : ing.minQty,
        costPerUnitPaise: body.costPerUnitPaise !== undefined ? Math.round(Number(body.costPerUnitPaise)) : ing.costPerUnitPaise,
        supplier: body.supplier ?? ing.supplier,
        location: body.location ?? ing.location,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : ing.expiresAt,
      },
    });
    await logAudit(s.name, s.role, "INGREDIENT_UPDATED", ing.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
