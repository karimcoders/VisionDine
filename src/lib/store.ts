/* VisionDine client state — zustand */
"use client";
import { create } from "zustand";
import type { CartLine, Role, View } from "@/lib/types";
import type { Discount } from "@/lib/money";

export type HeldCart = {
  id: string;
  label: string;
  lines: CartLine[];
  orderType: string;
  tableId: string | null;
  tableNumber: number | null;
  guestCount: number | null;
  customerName: string;
  discount: Discount;
  discountReason: string;
  couponCode?: string;
  heldAt: number;
};

export type Auth = { staffId: string; name: string; role: Role };

type VisionState = {
  auth: Auth | null;
  view: View;
  setAuth: (a: Auth | null) => void;
  setView: (v: View) => void;

  // POS cart
  cart: CartLine[];
  discountDialogOpen: boolean;
  orderType: string;
  tableId: string | null;
  tableNumber: number | null;
  guestCount: number | null;
  customerName: string;
  discount: Discount;
  discountReason: string;
  couponCode: string;
  addToCart: (line: CartLine) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  setOrderType: (t: string) => void;
  setTable: (id: string | null, number: number | null) => void;
  setGuestCount: (n: number | null) => void;
  setCustomerName: (n: string) => void;
  setDiscount: (d: Discount, reason: string) => void;
  setCoupon: (c: string) => void;

  // Held orders (parked carts, persisted per terminal)
  held: HeldCart[];
  holdCurrent: (label: string) => void;
  resumeHeld: (id: string) => void;
  dropHeld: (id: string) => void;
};

const HELD_KEY = "visiondine.held.v1";
function loadHeld(): HeldCart[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHeld(h: HeldCart[]) {
  if (typeof window !== "undefined") localStorage.setItem(HELD_KEY, JSON.stringify(h));
}

export const useVision = create<VisionState>((set, get) => ({
  auth: null,
  view: "dashboard",
  setAuth: (a) => set({ auth: a }),
  setView: (v) => set({ view: v }),

  cart: [],
  orderType: "DINE_IN",
  discountDialogOpen: false,
  tableId: null,
  tableNumber: null,
  guestCount: null,
  customerName: "",
  discount: null,
  discountReason: "",
  couponCode: "",
  addToCart: (line) =>
    set((s) => {
      const existing = s.cart.find((l) => l.key === line.key);
      if (existing)
        return { cart: s.cart.map((l) => (l.key === line.key ? { ...l, qty: l.qty + line.qty } : l)) };
      return { cart: [...s.cart, line] };
    }),
  setQty: (key, qty) =>
    set((s) => ({
      cart: qty <= 0 ? s.cart.filter((l) => l.key !== key) : s.cart.map((l) => (l.key === key ? { ...l, qty } : l)),
    })),
  removeLine: (key) => set((s) => ({ cart: s.cart.filter((l) => l.key !== key) })),
  clearCart: () => set({ cart: [], discount: null, discountReason: "", couponCode: "" }),
  setOrderType: (t) => set({ orderType: t, tableId: t === "DINE_IN" ? get().tableId : null }),
  setTable: (id, number) => set({ tableId: id, tableNumber: number }),
  setGuestCount: (n) => set({ guestCount: n }),
  setCustomerName: (n) => set({ customerName: n }),
  setDiscount: (d, reason) => set({ discount: d, discountReason: reason }),
  setCoupon: (c) => set({ couponCode: c }),

  held: typeof window !== "undefined" ? loadHeld() : [],
  holdCurrent: (label) => {
    const s = get();
    if (!s.cart.length) return;
    const h: HeldCart = {
      id: Math.random().toString(36).slice(2, 9),
      label,
      lines: s.cart,
      orderType: s.orderType,
      tableId: s.tableId,
      tableNumber: s.tableNumber,
      guestCount: s.guestCount,
      customerName: s.customerName,
      discount: s.discount,
      discountReason: s.discountReason,
      couponCode: s.couponCode,
      heldAt: Date.now(),
    };
    const held = [h, ...s.held].slice(0, 12);
    saveHeld(held);
    set({ held, cart: [], discount: null, discountReason: "", couponCode: "" });
  },
  resumeHeld: (id) => {
    const s = get();
    const h = s.held.find((x) => x.id === id);
    if (!h) return;
    saveHeld(s.held.filter((x) => x.id !== id));
    set({
      held: s.held.filter((x) => x.id !== id),
      cart: h.lines,
      orderType: h.orderType,
      tableId: h.tableId,
      tableNumber: h.tableNumber,
      guestCount: h.guestCount,
      customerName: h.customerName,
      discount: h.discount,
      discountReason: h.discountReason,
      couponCode: h.couponCode || "",
    });
  },
  dropHeld: (id) => {
    const held = get().held.filter((x) => x.id !== id);
    saveHeld(held);
    set({ held });
  },
}));
