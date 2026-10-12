/* Receipt serialization — server-side; enriches order with restaurant profile */
import { db } from "@/lib/db";
import type { OrderDTO } from "@/lib/types";

export type ReceiptDTO = {
  profile: { name: string; legalName?: string; address?: string; phone?: string; gstin?: string; fssai?: string };
  footer: string;
  order: OrderDTO;
};

export async function buildReceipt(order: any): Promise<ReceiptDTO> {
  const [profileRow, receiptRow] = await Promise.all([
    db.setting.findUnique({ where: { key: "profile" } }),
    db.setting.findUnique({ where: { key: "receipt" } }),
  ]);
  const profile = profileRow ? JSON.parse(profileRow.value) : { name: "VisionDine" };
  const footer = receiptRow ? JSON.parse(receiptRow.value).footer || "" : "";
  return {
    profile,
    footer,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      type: order.type,
      status: order.status,
      tableId: order.tableId || null,
      tableNumber: order.table?.number || null,
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      discountReason: order.discountReason || null,
      couponCode: order.couponCode || null,
      servicePaise: order.servicePaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName || null,
      customerPhone: order.customerPhone || null,
      guestCount: order.guestCount || null,
      createdVia: order.createdVia,
      billRequested: order.billRequested,
      assistRequested: order.assistRequested,
      notes: order.notes || null,
      createdAt: order.createdAt?.toISOString?.() || order.createdAt,
      completedAt: order.completedAt?.toISOString?.() || order.completedAt || null,
      staffName: order.staff?.name || null,
      items: (order.items || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        unitPricePaise: i.unitPricePaise,
        variantName: i.variantName || null,
        addonsJson: i.addonsJson || null,
        notes: i.notes || null,
        station: i.station,
        status: i.status,
        createdAt: i.createdAt?.toISOString?.() || i.createdAt,
        readyAt: i.readyAt?.toISOString?.() || null,
        servedAt: i.servedAt?.toISOString?.() || null,
      })),
      payments: (order.payments || []).map((p: any) => ({
        method: p.method,
        amountPaise: p.amountPaise,
        reference: p.reference || null,
        createdAt: p.createdAt?.toISOString?.() || p.createdAt,
      })),
    } as OrderDTO,
  };
}
