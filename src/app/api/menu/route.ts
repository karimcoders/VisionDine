/* Menu management — categories + items + variants + addons (server-validated) */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, errorResponse, HttpError, logAudit, getSession } from "@/lib/session";
import type { Role } from "@/lib/session";
import type { MenuPayload } from "@/lib/types";

const STAFF_ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "INVENTORY"];

export async function GET() {
  try {
    const s = await getSession();
    if (!s) throw new HttpError(401, "Sign in required");
    const [categories, items] = await Promise.all([
      db.category.findMany({ orderBy: { sortOrder: "asc" } }),
      db.menuItem.findMany({
        include: { variants: true, addons: true, category: true },
        orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }],
      }),
    ]);
    const payload: MenuPayload = {
      categories: categories.map((c) => ({ id: c.id, name: c.name, station: c.station, sortOrder: c.sortOrder, active: c.active })),
      items: items.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        pricePaise: m.pricePaise,
        categoryId: m.categoryId,
        categoryName: m.category.name,
        diet: m.diet,
        station: m.station,
        allergens: m.allergens,
        prepMinutes: m.prepMinutes,
        available: m.available,
        soldOut: m.soldOut,
        scheduleNote: m.scheduleNote,
        variants: m.variants.map((v) => ({ id: v.id, name: v.name, priceDeltaPaise: v.priceDeltaPaise, available: v.available })),
        addons: m.addons.map((a) => ({ id: a.id, name: a.name, pricePaise: a.pricePaise, available: a.available })),
      })),
    };
    return NextResponse.json(payload);
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "INVENTORY"]);
    const body = await req.json();
    if (body.kind === "category") {
      if (!body.name?.trim()) throw new HttpError(400, "Category name is required");
      const count = await db.category.count();
      const c = await db.category.create({
        data: { name: body.name.trim(), station: body.station || "MAIN", sortOrder: body.sortOrder ?? count },
      });
      await logAudit(s.name, s.role, "CATEGORY_CREATED", c.name);
      return NextResponse.json({ id: c.id });
    }
    // menu item
    if (!body.name?.trim() || !body.categoryId) throw new HttpError(400, "Name and category are required");
    const price = Math.round(Number(body.pricePaise));
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Enter a valid price");
    const cat = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!cat) throw new HttpError(400, "Category not found");
    const item = await db.menuItem.create({
      data: {
        name: body.name.trim(),
        description: body.description || null,
        pricePaise: price,
        categoryId: body.categoryId,
        diet: body.diet || "VEG",
        station: body.station || cat.station,
        allergens: body.allergens || null,
        prepMinutes: Number(body.prepMinutes) || 12,
        available: body.available ?? true,
        scheduleNote: body.scheduleNote || null,
      },
    });
    for (const v of body.variants || []) {
      if (v.name?.trim()) await db.variant.create({ data: { menuItemId: item.id, name: v.name.trim(), priceDeltaPaise: Math.round(Number(v.priceDeltaPaise) || 0) } });
    }
    for (const a of body.addons || []) {
      if (a.name?.trim()) await db.addon.create({ data: { menuItemId: item.id, name: a.name.trim(), pricePaise: Math.round(Number(a.pricePaise) || 0) } });
    }
    await logAudit(s.name, s.role, "MENU_ITEM_CREATED", `${item.name} @ ₹${(price / 100).toFixed(0)}`);
    return NextResponse.json({ id: item.id });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER", "INVENTORY"]);
    const body = await req.json();
    if (body.kind === "category") {
      const c = await db.category.update({
        where: { id: body.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.station ? { station: body.station } : {}),
          ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        },
      });
      await logAudit(s.name, s.role, "CATEGORY_UPDATED", c.name);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "item-toggle") {
      const m = await db.menuItem.update({ where: { id: body.id }, data: { available: !!body.available } });
      await logAudit(s.name, s.role, "MENU_ITEM_UPDATED", `${m.name} → ${m.available ? "available" : "unavailable"}`);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "item-soldout") {
      const m = await db.menuItem.update({ where: { id: body.id }, data: { soldOut: !!body.soldOut } });
      await logAudit(s.name, s.role, "MENU_ITEM_UPDATED", `${m.name} → ${m.soldOut ? "sold out" : "back in stock"}`);
      return NextResponse.json({ ok: true });
    }
    // full item update
    const existing = await db.menuItem.findUnique({ where: { id: body.id } });
    if (!existing) throw new HttpError(404, "Menu item not found");
    const price = body.pricePaise !== undefined ? Math.round(Number(body.pricePaise)) : existing.pricePaise;
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Enter a valid price");
    await db.menuItem.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() || existing.name,
        description: body.description ?? existing.description,
        pricePaise: price,
        categoryId: body.categoryId || existing.categoryId,
        diet: body.diet || existing.diet,
        station: body.station || existing.station,
        allergens: body.allergens ?? existing.allergens,
        prepMinutes: body.prepMinutes !== undefined ? Number(body.prepMinutes) || 12 : existing.prepMinutes,
        available: typeof body.available === "boolean" ? body.available : existing.available,
        soldOut: typeof body.soldOut === "boolean" ? body.soldOut : existing.soldOut,
        scheduleNote: body.scheduleNote ?? existing.scheduleNote,
      },
    });
    if (Array.isArray(body.variants)) {
      await db.variant.deleteMany({ where: { menuItemId: body.id } });
      for (const v of body.variants) {
        if (v.name?.trim()) await db.variant.create({ data: { menuItemId: body.id, name: v.name.trim(), priceDeltaPaise: Math.round(Number(v.priceDeltaPaise) || 0) } });
      }
    }
    if (Array.isArray(body.addons)) {
      await db.addon.deleteMany({ where: { menuItemId: body.id } });
      for (const a of body.addons) {
        if (a.name?.trim()) await db.addon.create({ data: { menuItemId: body.id, name: a.name.trim(), pricePaise: Math.round(Number(a.pricePaise) || 0) } });
      }
    }
    await logAudit(s.name, s.role, "MENU_ITEM_UPDATED", existing.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const s = await requireRole(["OWNER", "MANAGER"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new HttpError(400, "id is required");
    if (searchParams.get("kind") === "category") {
      const items = await db.menuItem.count({ where: { categoryId: id } });
      if (items > 0) throw new HttpError(400, "Category has menu items. Move them first.");
      await db.category.delete({ where: { id } });
      await logAudit(s.name, s.role, "CATEGORY_DELETED", id);
      return NextResponse.json({ ok: true });
    }
    const m = await db.menuItem.findUnique({ where: { id } });
    if (!m) throw new HttpError(404, "Menu item not found");
    await db.orderItem.updateMany({ where: { menuItemId: id }, data: { menuItemId: null } });
    await db.menuItem.delete({ where: { id } });
    await logAudit(s.name, s.role, "MENU_ITEM_DELETED", m.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = errorResponse(e);
    return NextResponse.json({ error }, { status });
  }
}
