import { describe, expect, it } from "vitest";
import { LINE_PENDING_NOTE, backorderNote } from "./constants";
import {
  backorderCount,
  lineStatusNote,
  shownBackorderQty,
  toOrderDetail,
  toOrderSummary,
} from "./derive";
import type {
  OrderDetailWire,
  OrderItemWire,
  OrderSummaryWire,
  WholesalerOrderWire,
} from "./types";

/*
 * side-03 S3-1(#279) — 도매처가 확정하기 전 주문에 미송이 뜨던 결함. 서버 backorderQty가
 * qty − shipped라 확정 전에도 값이 온다. 웹은 확정 전(NEW)만 0으로 보고, 확정 뒤는 그대로 둔다.
 */

function item(extra: Partial<OrderItemWire> = {}): OrderItemWire {
  return {
    listingId: 2003,
    title: "와이드 데님 팬츠",
    colorName: "소라",
    size: "M",
    qty: 8,
    receivedQty: 0,
    backorderQty: 8,
    unitPrice: 31000,
    lineAmount: 248000,
    expectedInboundDate: "2026-11-15",
    ...extra,
  };
}

function leg(
  statusKey: string,
  items: OrderItemWire[] = [item()],
): WholesalerOrderWire {
  return {
    wholesaleOrderId: 7010,
    orderNumber: 2,
    amount: 248000,
    isCancellable: statusKey === "NEW",
    status: { key: statusKey, label: statusKey },
    paymentTerm: "BANK_TRANSFER",
    receiveMethod: "RETAILER",
    wholesaler: {
      id: 102,
      name: "라온",
      storeBuilding: "디오트",
      storeUnit: "2층 201호",
      bankName: "신한은행",
      bankAccountNo: "110-102-000002",
      bankAccountHolder: "이라온",
    },
    items,
    outbounds: [],
  };
}

function detail(...wholesalerOrders: WholesalerOrderWire[]): OrderDetailWire {
  return {
    orderId: 6010,
    orderNo: "20261110-0227-0001",
    orderedAt: "2026-11-10T02:27:00+09:00",
    totalAmount: 248000,
    agentName: "",
    agentPhone: "",
    wholesalerOrders,
  };
}

function summary(extra: Partial<OrderSummaryWire> = {}): OrderSummaryWire {
  return {
    orderId: 6010,
    orderNo: "20261110-0227-0001",
    orderedAt: "2026-11-10T02:27:00+09:00",
    totalAmount: 310000,
    totalQty: 10,
    receivedQty: 0,
    backorderQty: 10,
    wholesalerCount: 1,
    wholesalerNames: ["라온"],
    actionBadge: "PENDING_ACCEPT",
    ...extra,
  };
}

describe("shownBackorderQty", () => {
  it("확정 전이면 0, 확정 뒤면 서버 값 그대로", () => {
    expect(shownBackorderQty(8, true)).toBe(0);
    expect(shownBackorderQty(8, false)).toBe(8);
  });
});

describe("toOrderDetail 미송 표시", () => {
  it("확정 전(NEW) + backorderQty 8 → PENDING, 미송 0, 미송 라인 0, 노트에 미송 없음", () => {
    const order = toOrderDetail(detail(leg("NEW")));
    const line = order.lines[0]!;

    expect(line.status).toBe("PENDING");
    expect(line.backorderQty).toBe(0);
    expect(backorderCount(order)).toBe(0);
    expect(lineStatusNote(line, order.legs[0])).toBe(LINE_PENDING_NOTE);
  });

  it("확정 뒤(CONFIRMED) + backorderQty 8 → BACKORDER 그대로, 미송 라인 1, 노트에 미송 8장", () => {
    const order = toOrderDetail(detail(leg("CONFIRMED")));
    const line = order.lines[0]!;

    expect(line.status).toBe("BACKORDER");
    expect(line.backorderQty).toBe(8);
    expect(backorderCount(order)).toBe(1);
    expect(lineStatusNote(line, order.legs[0])).toContain(backorderNote(8));
  });

  it("취소(CANCELLED)는 기존 그대로 CANCELED", () => {
    const order = toOrderDetail(detail(leg("CANCELLED")));

    expect(order.lines[0]!.status).toBe("CANCELED");
  });

  it("출고 완료(SHIPPED, 다 받음)는 기존 그대로 SHIPPED", () => {
    const order = toOrderDetail(
      detail(leg("SHIPPED", [item({ receivedQty: 8, backorderQty: 0 })])),
    );

    expect(order.lines[0]!.status).toBe("SHIPPED");
    expect(backorderCount(order)).toBe(0);
  });

  it("도매처 둘 중 확정 전 건만 0으로 본다", () => {
    const order = toOrderDetail(
      detail(leg("NEW"), { ...leg("CONFIRMED"), wholesaleOrderId: 7011 }),
    );

    expect(order.lines.map((l) => l.status)).toEqual(["PENDING", "BACKORDER"]);
    expect(backorderCount(order)).toBe(1);
  });
});

describe("toOrderSummary 미송 장수", () => {
  it("도매처 하나가 확정 대기면 0", () => {
    expect(toOrderSummary(summary()).backorderQty).toBe(0);
  });

  it("확정 뒤(준비 중)면 서버 값 그대로", () => {
    expect(
      toOrderSummary(summary({ actionBadge: "WAITING_SHIPMENT" })).backorderQty,
    ).toBe(10);
  });

  it("도매처 둘 이상이면 확정 대기여도 서버 값 그대로(확정된 건의 미송을 지우지 않는다)", () => {
    expect(
      toOrderSummary(
        summary({ wholesalerCount: 2, wholesalerNames: ["라온", "무드온"] }),
      ).backorderQty,
    ).toBe(10);
  });
});
