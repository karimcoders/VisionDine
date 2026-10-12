/* End-to-end API smoke test against the running dev server */
const BASE = "http://localhost:3000";
let cookie = "";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  return { status: res.status, data };
}

async function main() {
  console.log("== login as cashier (3003)");
  const login = await call("POST", "/api/auth", { pin: "3003" });
  console.log(login.status, JSON.stringify(login.data));

  console.log("\n== menu");
  const menu = await call("GET", "/api/menu");
  const menuData = menu.data as { items: { id: string; name: string; pricePaise: number }[] };
  console.log(menu.status, `${menuData.items.length} items`);

  console.log("\n== tables");
  const tables = await call("GET", "/api/tables");
  const tData = tables.data as { id: string; number: number; status: string }[];
  const free = tData.find((t) => t.status === "AVAILABLE");
  console.log(tables.status, `${tData.length} tables, first free: T${free?.number}`);

  console.log("\n== create dine-in order (2 items)");
  const item1 = menuData.items.find((m) => m.name === "Butter Chicken")!;
  const item2 = menuData.items.find((m) => m.name === "Butter Naan")!;
  const order = await call("POST", "/api/orders", {
    type: "DINE_IN", tableId: free.id, guestCount: 2,
    items: [{ menuItemId: item1.id, qty: 1 }, { menuItemId: item2.id, qty: 2, notes: "Extra crispy" }],
  });
  const o = order.data as { id: string; orderNo: string; subtotalPaise: number; taxPaise: number; totalPaise: number };
  console.log(order.status, `${o.orderNo} subtotal=${o.subtotalPaise} tax=${o.taxPaise} total=${o.totalPaise}`);
  // expected: 44500 + 13000 = 57500 subtotal; tax 5% incl => 2738; total 57500

  console.log("\n== apply manager-authorized discount 10% (cashier + PIN 2002)");
  const disc = await call("PATCH", "/api/orders", { orderId: o.id, action: "discount", kind: "PERCENT", value: 10, reason: "e2e test", managerPin: "2002" });
  const d = disc.data as { discountPaise: number; totalPaise: number };
  console.log(disc.status, `discount=${d.discountPaise} newTotal=${d.totalPaise}`);

  console.log("\n== kitchen sees ticket, starts & readies items");
  const kds = await call("GET", "/api/kitchen");
  const ticket = (kds.data as { id: string; items: { id: string }[] }[]).find((t) => t.id === o.id);
  console.log(kds.status, ticket ? `${ticket.items.length} items on ticket` : "no ticket");
  for (const it of ticket!.items) {
    await call("PATCH", "/api/kitchen", { itemId: it.id, status: "PREPARING" });
    await call("PATCH", "/api/kitchen", { itemId: it.id, status: "READY" });
  }
  const kds2 = await call("GET", "/api/kitchen");
  const t2 = (kds2.data as { id: string; items: { status: string }[] }[]).find((x) => x.id === o.id);
  console.log("order status after ready:", (t2?.items || []).map((i) => i.status).join(","));

  console.log("\n== pay with idempotency (double submit)");
  const idem = "e2e-" + Date.now();
  const pay1 = await call("POST", `/api/orders/${o.id}/pay`, { method: "CASH", idempotencyKey: idem });
  console.log("pay1:", pay1.status, (pay1.data as { duplicate?: boolean }).duplicate ? "DUPLICATE-FLAG" : "settled");
  const pay2 = await call("POST", `/api/orders/${o.id}/pay`, { method: "CASH", idempotencyKey: idem });
  console.log("pay2 (replay):", pay2.status, (pay2.data as { duplicate?: boolean }).duplicate ? "correctly returned duplicate" : "PROBLEM: not marked duplicate");

  console.log("\n== inventory: SALE movements created once? (login as inventory manager)");
  cookie = "";
  await call("POST", "/api/auth", { pin: "6007" });
  const inv = await call("GET", "/api/inventory?movements=200");
  const movs = (inv.data as { movements: { orderRef: string | null; type: string }[] }).movements.filter((m) => m.orderRef === o.orderNo && m.type === "SALE");
  console.log("SALE movements for order:", movs.length, "(should be 4 — butter chicken recipe lines + naan)");

  console.log("\n== dashboard (owner)");
  cookie = "";
  await call("POST", "/api/auth", { pin: "1001" });
  const dash = await call("GET", "/api/dashboard");
  const dd = dash.data as { today: { netPaise: number; orders: number }; lowStock: unknown[]; series: unknown[] };
  console.log(dash.status, `net=₹${(dd.today.netPaise / 100).toFixed(0)} orders=${dd.today.orders} lowStock=${dd.lowStock.length} series=${dd.series.length}d`);

  console.log("\n== QR public menu + order");
  const pm = await call("GET", "/api/public?table=3");
  const pmData = pm.data as { table: { number: number }; menu: { items: { id: string; name: string }[] } };
  console.log(pm.status, `table ${pmData.table.number}, ${pmData.menu.items.length} items public`);
  const chai = pmData.menu.items.find((i) => i.name === "Masala Chai")!;
  const qrOrder = await call("POST", "/api/public", { tableNumber: 3, items: [{ menuItemId: chai.id, qty: 2 }] });
  console.log("qr order:", qrOrder.status, JSON.stringify(qrOrder.data));

  console.log("\n== assistant");
  const ai = await call("POST", "/api/assistant", { question: "Aaj kitni sale hui?" });
  console.log(ai.status, typeof ai.data === "object" && ai.data && "answer" in ai.data ? String((ai.data as { answer: string }).answer).slice(0, 140).replace(/\n/g, " ") : JSON.stringify(ai.data).slice(0, 140));

  console.log("\n== unauthorized check: waiter trying inventory");
  cookie = "";
  await call("POST", "/api/auth", { pin: "4004" });
  const denied = await call("GET", "/api/inventory");
  console.log("waiter → inventory:", denied.status, JSON.stringify(denied.data));

  console.log("\nDONE");
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
