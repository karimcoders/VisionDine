/* VisionDine seed — realistic Indian restaurant data */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const R = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  await db.auditLog.deleteMany();
  await db.stockMovement.deleteMany();
  await db.payment.deleteMany();
  await db.refund.deleteMany();
  await db.orderItem.deleteMany();
  await db.variant.deleteMany();
  await db.addon.deleteMany();
  await db.recipeLine.deleteMany();
  await db.reservation.deleteMany();
  await db.order.deleteMany();
  await db.table.deleteMany();
  await db.menuItem.deleteMany();
  await db.category.deleteMany();
  await db.ingredient.deleteMany();
  await db.coupon.deleteMany();
  await db.customer.deleteMany();
  await db.staff.deleteMany();
  await db.setting.deleteMany();

  /* ---------- Staff (PIN login) ---------- */
  const [owner, manager, cashier, waiter1, waiter2, chef, invMgr] = await Promise.all([
    db.staff.create({ data: { name: "Aarav Kapoor", role: "OWNER", pin: "1001" } }),
    db.staff.create({ data: { name: "Meera Sharma", role: "MANAGER", pin: "2002" } }),
    db.staff.create({ data: { name: "Rohit Verma", role: "CASHIER", pin: "3003" } }),
    db.staff.create({ data: { name: "Priya Nair", role: "WAITER", pin: "4004" } }),
    db.staff.create({ data: { name: "Imran Sheikh", role: "WAITER", pin: "4005" } }),
    db.staff.create({ data: { name: "Chef Balwant", role: "KITCHEN", pin: "5006" } }),
    db.staff.create({ data: { name: "Sunita Rao", role: "INVENTORY", pin: "6007" } }),
  ]);
  const waiters = [waiter1, waiter2];

  /* ---------- Tables ---------- */
  const tableRows: { number: number; seats: number; zone: string }[] = [];
  for (let i = 1; i <= 8; i++) tableRows.push({ number: i, seats: i % 3 === 0 ? 2 : 4, zone: "Indoor" });
  for (let i = 9; i <= 12; i++) tableRows.push({ number: i, seats: 6, zone: "Terrace" });
  for (let i = 13; i <= 14; i++) tableRows.push({ number: i, seats: 10, zone: "Private Dining" });
  await db.table.createMany({ data: tableRows });
  const tRows = await db.table.findMany({ orderBy: { number: "asc" } });
  const tByNo = new Map(tRows.map((t) => [t.number, t.id]));

  await db.reservation.createMany({
    data: [
      { tableId: tByNo.get(5)!, guestName: "Khan Family", phone: "9820011223", guestCount: 4, at: new Date(Date.now() + 3 * 36e5) },
      { tableId: tByNo.get(13)!, guestName: "Gupta Anniversary Dinner", phone: "9833344455", guestCount: 10, at: new Date(Date.now() + 6 * 36e5), note: "Cake cutting at 9pm" },
    ],
  });

  /* ---------- Ingredients ---------- */
  const ingData = [
    { name: "Chicken", unit: "KG", qty: 14.5, minQty: 8, costPerUnitPaise: 28000, supplier: "Zenith Farms", location: "Walk-in Freezer", expiresAt: new Date(Date.now() + 2 * 864e5) },
    { name: "Paneer", unit: "KG", qty: 3.2, minQty: 4, costPerUnitPaise: 38000, supplier: "Amul Distributors", location: "Cold Storage", expiresAt: new Date(Date.now() + 3 * 864e5) },
    { name: "Basmati Rice", unit: "KG", qty: 42, minQty: 15, costPerUnitPaise: 12000, supplier: "Kerala Traders", location: "Dry Store A" },
    { name: "Atta (Wheat Flour)", unit: "KG", qty: 28, minQty: 12, costPerUnitPaise: 4500, supplier: "Kerala Traders", location: "Dry Store A" },
    { name: "Toor Dal", unit: "KG", qty: 18.5, minQty: 8, costPerUnitPaise: 16000, supplier: "Kerala Traders", location: "Dry Store A" },
    { name: "Desi Ghee", unit: "L", qty: 6.8, minQty: 4, costPerUnitPaise: 62000, supplier: "Amul Distributors", location: "Cold Storage" },
    { name: "Fresh Vegetables", unit: "KG", qty: 21, minQty: 10, costPerUnitPaise: 6000, supplier: "Morning Market Co.", location: "Vegetable Rack", expiresAt: new Date(Date.now() + 864e5) },
    { name: "Tomatoes", unit: "KG", qty: 2.4, minQty: 5, costPerUnitPaise: 4000, supplier: "Morning Market Co.", location: "Vegetable Rack", expiresAt: new Date(Date.now() + 864e5) },
    { name: "Milk", unit: "L", qty: 16, minQty: 8, costPerUnitPaise: 6600, supplier: "Amul Distributors", location: "Cold Storage", expiresAt: new Date(Date.now() + 2 * 864e5) },
    { name: "Coffee Beans", unit: "KG", qty: 1.1, minQty: 2, costPerUnitPaise: 180000, supplier: "Blue Tokai Supply", location: "Beverage Counter", expiresAt: new Date(Date.now() + 20 * 864e5) },
    { name: "Tea Leaves", unit: "G", qty: 850, minQty: 400, costPerUnitPaise: 300, supplier: "Society Tea Co.", location: "Beverage Counter" },
    { name: "Cold Drinks Syrup", unit: "L", qty: 9, minQty: 4, costPerUnitPaise: 22000, supplier: "Beverage Hub", location: "Beverage Counter" },
    { name: "Prawns", unit: "KG", qty: 4.6, minQty: 3, costPerUnitPaise: 65000, supplier: "Coastal Catch", location: "Walk-in Freezer", expiresAt: new Date(Date.now() + 864e5) },
    { name: "Cooking Oil", unit: "L", qty: 24, minQty: 10, costPerUnitPaise: 15000, supplier: "Beverage Hub", location: "Dry Store B" },
  ];
  const ings: Record<string, string> = {};
  for (const d of ingData) {
    const row = await db.ingredient.create({ data: d });
    ings[d.name] = row.id;
  }

  /* ---------- Menu ---------- */
  type Item = { name: string; desc: string; price: number; diet: string; station?: string; prep?: number; allergens?: string; recipe?: [string, number][]; variants?: [string, number][]; addons?: [string, number][] };
  type Cat = { name: string; station: string; items: Item[] };
  const menu: Cat[] = [
    { name: "Starters — Veg", station: "TANDOOR", items: [
      { name: "Paneer Tikka Malai", desc: "Char-grilled cottage cheese, cardamom cream marinade, mint chutney", price: 345, diet: "VEG", allergens: "Dairy", prep: 14, recipe: [["Paneer", 0.2], ["Desi Ghee", 0.02], ["Fresh Vegetables", 0.05]], addons: [["Extra Mint Chutney", 40], ["Cheese Stuffed", 80]] },
      { name: "Crispy Corn Salt & Pepper", desc: "Golden fried corn kernels tossed with peppers and spring onion", price: 265, diet: "VEG", prep: 10, recipe: [["Cooking Oil", 0.05], ["Fresh Vegetables", 0.08]] },
      { name: "Dahi ke Kebab", desc: "Melt-in-mouth hung curd patties, roasted chilli, pistachio crumble", price: 295, diet: "VEG", allergens: "Dairy, Nuts", prep: 12, recipe: [["Milk", 0.15]] },
      { name: "Mushroom Galouti", desc: "Silky mushroom patties with ghee-basted warqi paratha dippers", price: 325, diet: "VEG", allergens: "Gluten, Dairy", prep: 15, recipe: [["Desi Ghee", 0.03], ["Atta (Wheat Flour)", 0.08]] },
    ]},
    { name: "Starters — Non-Veg", station: "TANDOOR", items: [
      { name: "Chicken Tikka Achari", desc: "Yogurt-pickle marinated chicken thigh, charred over coal", price: 385, diet: "NONVEG", prep: 16, recipe: [["Chicken", 0.25]], addons: [["Extra Chutney", 40]] },
      { name: "Tandoori Prawns Koliwada", desc: "Mumbai-style batter-fried prawns, kacchi kairi slaw", price: 495, diet: "NONVEG", allergens: "Shellfish", prep: 15, recipe: [["Prawns", 0.2]] },
      { name: "Malai Chicken Kebab", desc: "Cream cheese and cardamom marinated, mildly spiced", price: 415, diet: "NONVEG", allergens: "Dairy", prep: 16, recipe: [["Chicken", 0.25], ["Milk", 0.1]] },
      { name: "Andhra Chilli Chicken", desc: "Fiery curry-leaf and garlic tossed chicken, Guntur chilli", price: 365, diet: "NONVEG", prep: 12, recipe: [["Chicken", 0.22], ["Fresh Vegetables", 0.06]] },
    ]},
    { name: "Main Course", station: "MAIN", items: [
      { name: "Butter Chicken", desc: "Tandoor-roasted chicken folded into tomato-makhani gravy", price: 445, diet: "NONVEG", allergens: "Dairy", prep: 18, recipe: [["Chicken", 0.3], ["Tomatoes", 0.15], ["Desi Ghee", 0.03], ["Milk", 0.1]], variants: [["Half", -80], ["Full", 0]] },
      { name: "Dal Makhani", desc: "48-hour slow-cooked black lentils, smoked butter finish", price: 325, diet: "VEG", allergens: "Dairy", prep: 15, recipe: [["Toor Dal", 0.15], ["Desi Ghee", 0.04], ["Milk", 0.08]], variants: [["Half", -80], ["Full", 0]] },
      { name: "Paneer Lababdar", desc: "Silky onion-tomato gravy, kasuri methi, fresh paneer cubes", price: 395, diet: "VEG", allergens: "Dairy", prep: 16, recipe: [["Paneer", 0.2], ["Tomatoes", 0.12]], variants: [["Half", -70], ["Full", 0]] },
      { name: "Kerala Fish Curry", desc: "Coconut-milk based meen curry with kodampuli, red rice pairing", price: 475, diet: "NONVEG", allergens: "Fish", prep: 20, recipe: [["Prawns", 0.05], ["Tomatoes", 0.1]] },
      { name: "Veg Kolhapuri", desc: "Robust, fiery mixed-vegetable curry, coconut and poppy seed", price: 335, diet: "VEG", prep: 16, recipe: [["Fresh Vegetables", 0.2]] },
      { name: "Mutton Rogan Josh", desc: "Kashmiri chilli, fennel and slow-braised mutton shanks", price: 565, diet: "NONVEG", prep: 25, recipe: [["Chicken", 0.05], ["Tomatoes", 0.1]] },
    ]},
    { name: "Breads & Rice", station: "TANDOOR", items: [
      { name: "Butter Naan", desc: "Leavened tandoor bread brushed with white butter", price: 65, diet: "VEG", allergens: "Gluten, Dairy", prep: 6, recipe: [["Atta (Wheat Flour)", 0.1], ["Desi Ghee", 0.01]] },
      { name: "Laccha Paratha", desc: "Multi-layered whole wheat paratha, flaky finish", price: 75, diet: "VEG", allergens: "Gluten", prep: 7, recipe: [["Atta (Wheat Flour)", 0.12]] },
      { name: "Hyderabadi Chicken Dum Biryani", desc: "Sealed-pot biryani, saffron rice, mirchi ka salan, raita", price: 425, diet: "NONVEG", prep: 22, recipe: [["Basmati Rice", 0.2], ["Chicken", 0.25]], variants: [["Veg Biryani", -65], ["Chicken", 0], ["Mutton", 120]], addons: [["Extra Raita", 45], ["Extra Salan", 35]] },
      { name: "Jeera Rice", desc: "Basmati tossed with roasted cumin and ghee", price: 215, diet: "VEG", prep: 10, recipe: [["Basmati Rice", 0.15], ["Desi Ghee", 0.02]] },
      { name: "Veg Fried Rice", desc: "Wok-tossed rice, burnt garlic, seasonal vegetables", price: 245, diet: "VEG", prep: 12, recipe: [["Basmati Rice", 0.15], ["Fresh Vegetables", 0.1]] },
    ]},
    { name: "South Indian", station: "MAIN", items: [
      { name: "Ghee Roast Dosa", desc: "Crisp lace dosa with molten ghee, potato masala, three chutneys", price: 195, diet: "VEG", allergens: "Dairy", prep: 10, recipe: [["Atta (Wheat Flour)", 0.08], ["Desi Ghee", 0.02]] },
      { name: "Idli Sambar (4 pc)", desc: "Steamed rice cakes, piping sambar, podi butter", price: 145, diet: "VEG", prep: 8, recipe: [["Toor Dal", 0.06]] },
      { name: "Rava Uttapam", desc: "Thick semolina uttapam, onion, tomato, curry leaf tempering", price: 175, diet: "VEG", prep: 10, recipe: [["Fresh Vegetables", 0.06]] },
    ]},
    { name: "Beverages", station: "BEVERAGE", items: [
      { name: "Masala Chai", desc: "Cutting chai with ginger, cardamom and lemongrass", price: 85, diet: "VEG", prep: 6, recipe: [["Tea Leaves", 15], ["Milk", 0.15]] },
      { name: "Filter Coffee", desc: "Traditional davara-tumbler, chicory blend", price: 110, diet: "VEG", prep: 7, recipe: [["Coffee Beans", 0.02], ["Milk", 0.12]] },
      { name: "Cold Coffee Frappe", desc: "Double-shot espresso, vanilla bean, whipped cream", price: 225, diet: "VEG", allergens: "Dairy", prep: 8, recipe: [["Coffee Beans", 0.03], ["Milk", 0.2]] },
      { name: "Fresh Lime Soda", desc: "Sweet-salted, mint crush, sparkling", price: 95, diet: "VEGAN", prep: 4 },
      { name: "Mango Lassi", desc: "Alphonso pulp whipped with curd, saffron strands", price: 165, diet: "VEG", allergens: "Dairy", prep: 6, recipe: [["Milk", 0.2]] },
      { name: "Sparkling Water", desc: "Chilled mineral water, lime wheel", price: 60, diet: "VEGAN", prep: 1 },
    ]},
    { name: "Desserts", station: "DESSERT", items: [
      { name: "Gulab Jamun (2 pc)", desc: "Warm khoya dumplings, rose syrup, rabri drizzle", price: 145, diet: "VEG", allergens: "Dairy, Gluten", prep: 5, recipe: [["Milk", 0.1]] },
      { name: "Rasmalai", desc: "Saffron-poached chenna discs, pistachio, reduced milk", price: 185, diet: "VEG", allergens: "Dairy, Nuts", prep: 6, recipe: [["Milk", 0.15]] },
      { name: "Chocolate Fondant", desc: "Molten-centre dark chocolate cake, vanilla bean ice cream", price: 265, diet: "EGG", allergens: "Dairy, Egg, Gluten", prep: 12, recipe: [["Milk", 0.1]] },
      { name: "Kulfi Falooda", desc: "Kesar pista kulfi, rose falooda, basil seeds", price: 215, diet: "VEG", allergens: "Dairy, Nuts", prep: 8, recipe: [["Milk", 0.2]] },
    ]},
  ];

  const menuMeta: Record<string, { id: string; station: string; pricePaise: number; recipe: [string, number][] }> = {};
  let cs = 0;
  for (const cat of menu) {
    const c = await db.category.create({ data: { name: cat.name, station: cat.station, sortOrder: cs++ } });
    let is = 0;
    for (const it of cat.items) {
      const mi = await db.menuItem.create({
        data: {
          name: it.name, description: it.desc, pricePaise: it.price * 100, categoryId: c.id,
          diet: it.diet, station: it.station || cat.station, allergens: it.allergens,
          prepMinutes: it.prep || 12, sortOrder: is++,
        },
      });
      menuMeta[it.name] = { id: mi.id, station: mi.station, pricePaise: it.price * 100, recipe: it.recipe || [] };
      if (it.variants) for (const [vn, delta] of it.variants) await db.variant.create({ data: { menuItemId: mi.id, name: vn, priceDeltaPaise: delta * 100 } });
      if (it.addons) for (const [an, ap] of it.addons) await db.addon.create({ data: { menuItemId: mi.id, name: an, pricePaise: ap * 100 } });
      for (const [ingName, qty] of it.recipe || []) {
        if (ings[ingName]) await db.recipeLine.create({ data: { menuItemId: mi.id, ingredientId: ings[ingName], qtyPerServing: qty } });
      }
    }
  }

  /* ---------- Settings / Coupons / Customers ---------- */
  const S = (k: string, v: unknown) => ({ key: k, value: JSON.stringify(v) });
  await db.setting.createMany({
    data: [
      S("profile", { name: "VisionDine — Bandra West", legalName: "VisionDine Hospitality Pvt. Ltd.", address: "14, Hill Road, Bandra West, Mumbai 400050", phone: "+91 22 4890 1212", email: "hello@visiondine.in", gstin: "27ABCDE1234F1Z5", fssai: "11523998000123" }),
      S("tax", { gstPercent: 5, taxInclusive: true, serviceChargePercent: 0 }),
      S("receipt", { footer: "Thank you for dining with us! Feedback: 98200 12121 · visiondine.in" }),
      S("orderPrefix", { prefix: "VD" }),
      S("hours", { open: "11:00", close: "23:30", closedOn: "None" }),
      S("loyalty", { enabled: true, earnPerHundred: 2 }),
    ],
  });
  await db.coupon.createMany({
    data: [
      { code: "WELCOME10", kind: "PERCENT", value: 10, minOrderPaise: 50000 },
      { code: "FLAT50", kind: "FLAT", value: 5000, minOrderPaise: 30000 },
      { code: "LUNCH15", kind: "PERCENT", value: 15, minOrderPaise: 80000, active: false },
    ],
  });
  const custs: [string, string, number][] = [
    ["Ananya Iyer", "9820055566", 240], ["Karan Malhotra", "9811122233", 130], ["Zoya Rahman", "9755588899", 90],
    ["Dev Patel", "9898989898", 45], ["Sneha Kulkarni", "9767676767", 310], ["Vikram Singh", "9812345678", 0],
  ];
  for (const [n, p, lp] of custs) await db.customer.create({ data: { name: n, phone: p, loyaltyPoints: lp } });

  /* ---------- Historical orders (7 days) for real analytics ---------- */
  const popular = ["Butter Chicken", "Dal Makhani", "Butter Naan", "Hyderabadi Chicken Dum Biryani", "Paneer Lababdar", "Masala Chai", "Gulab Jamun (2 pc)", "Chicken Tikka Achari", "Ghee Roast Dosa", "Mango Lassi"];
  let seq = 0;
  const istOffsetMs = 5.5 * 3600 * 1000;
  const dayStart = (daysAgo: number) => {
    const d = new Date(Date.now() + istOffsetMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() - istOffsetMs - daysAgo * 864e5;
  };
  const methodPick = () => { const r = Math.random(); return r < 0.42 ? "UPI" : r < 0.72 ? "CASH" : r < 0.95 ? "CARD" : "SPLIT"; };

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const weekend = [0, 6].includes(new Date(dayStart(daysAgo)).getUTCDay());
    const count = weekend ? R(14, 18) : R(9, 13);
    for (let i = 0; i < count; i++) {
      seq++;
      const startMs = dayStart(daysAgo) + R(11, 22) * 3600e3 + R(0, 59) * 60e3;
      const nItems = R(2, 5);
      const lines: { name: string; qty: number }[] = [];
      const firstPopular = pick(popular);
      lines.push({ name: firstPopular, qty: R(1, 3) });
      for (let j = 1; j < nItems; j++) {
        const nm = Math.random() < 0.6 ? pick(popular) : pick(Object.keys(menuMeta));
        if (!lines.find((l) => l.name === nm)) lines.push({ name: nm, qty: R(1, 2) });
      }
      let subtotal = 0;
      const itemRows = lines.map((l) => {
        const m = menuMeta[l.name];
        subtotal += m.pricePaise * l.qty;
        return { menuItemId: m.id, name: l.name, unitPricePaise: m.pricePaise, qty: l.qty, station: m.station, status: "SERVED", createdAt: new Date(startMs), readyAt: new Date(startMs + R(8, 22) * 60e3), servedAt: new Date(startMs + R(24, 45) * 60e3) };
      });
      const tax = Math.round(subtotal * 5 / 105);
      const type = Math.random() < 0.68 ? "DINE_IN" : Math.random() < 0.75 ? "TAKEAWAY" : "DELIVERY";
      const tableNo = type === "DINE_IN" ? pick(tableRows).number : null;
      const cancelled = daysAgo > 1 && Math.random() < 0.035;
      const completedAt = new Date(startMs + R(30, 70) * 60e3);
      const order = await db.order.create({
        data: {
          orderNo: `VD-${String(seq).padStart(4, "0")}`, type,
          tableId: tableNo ? tByNo.get(tableNo)! : null,
          status: cancelled ? "CANCELLED" : "COMPLETED", subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal,
          paymentStatus: cancelled ? "UNPAID" : "PAID",
          customerName: Math.random() < 0.4 ? pick(custs)[0] : null,
          staffId: pick([cashier.id, waiter1.id, waiter2.id]),
          createdVia: Math.random() < 0.12 ? "QR" : "POS",
          createdAt: new Date(startMs), completedAt,
          items: { create: itemRows },
        },
      });
      if (!cancelled) {
        await db.payment.create({ data: { orderId: order.id, method: methodPick(), amountPaise: subtotal, createdAt: new Date(startMs + R(30, 65) * 60e3) } });
        for (const l of lines) {
          for (const [ingName, qtyPer] of menuMeta[l.name].recipe) {
            if (!ings[ingName]) continue;
            await db.stockMovement.create({ data: { ingredientId: ings[ingName], type: "SALE", qtyDelta: -(qtyPer * l.qty), orderRef: order.orderNo, createdAt: completedAt } });
          }
        }
      }
    }
  }

  /* ---------- Two live demo orders (so KDS / Tables look alive on first login) ---------- */
  const now = Date.now();
  for (const [idx, tno] of [2, 6].entries()) {
    const lines = idx === 0
      ? [{ name: "Butter Chicken", qty: 1 }, { name: "Butter Naan", qty: 3 }, { name: "Masala Chai", qty: 2 }]
      : [{ name: "Hyderabadi Chicken Dum Biryani", qty: 2 }, { name: "Mango Lassi", qty: 2 }];
    let subtotal = 0;
    const itemRows = lines.map((l) => {
      const m = menuMeta[l.name];
      subtotal += m.pricePaise * l.qty;
      return { menuItemId: m.id, name: l.name, unitPricePaise: m.pricePaise, qty: l.qty, station: m.station, status: idx === 0 ? "PREPARING" : "QUEUED", createdAt: new Date(now - (idx === 0 ? 9 * 60e3 : 2 * 60e3)) };
    });
    await db.order.create({
      data: {
        orderNo: `VD-${String(seq + 1 + idx).padStart(4, "0")}`, type: "DINE_IN",
        tableId: tByNo.get(tno)!, status: "PREPARING", subtotalPaise: subtotal, taxPaise: Math.round(subtotal * 5 / 105),
        totalPaise: subtotal, guestCount: tno === 2 ? 3 : 5, staffId: waiter1.id, createdVia: "POS",
        createdAt: new Date(now - (idx === 0 ? 9 * 60e3 : 2 * 60e3)),
        items: { create: itemRows },
      },
    });
    await db.table.update({ where: { id: tByNo.get(tno)! }, data: { status: "OCCUPIED", openedAt: new Date(now - (idx === 0 ? 38 * 60e3 : 12 * 60e3)), guestCount: tno === 2 ? 3 : 5 } });
  }

  await db.auditLog.createMany({
    data: [
      { staffName: "Meera Sharma", role: "MANAGER", action: "DISCOUNT_APPLIED", detail: "10% on VD-0112 — regular guest", createdAt: new Date(now - 5 * 36e5) },
      { staffName: "Rohit Verma", role: "CASHIER", action: "ORDER_CANCELLED", detail: "VD-0098 cancelled — duplicate entry", createdAt: new Date(now - 9 * 36e5) },
      { staffName: "Sunita Rao", role: "INVENTORY", action: "STOCK_WASTAGE", detail: "Tomatoes 1.2 KG — spoilage", createdAt: new Date(now - 26 * 36e5) },
    ],
  });

  const counts = {
    staff: await db.staff.count(), tables: await db.table.count(),
    menuItems: await db.menuItem.count(), orders: await db.order.count(),
    ingredients: await db.ingredient.count(), movements: await db.stockMovement.count(),
  };
  console.log("Seed complete:", counts);
}

main().finally(() => db.$disconnect());
