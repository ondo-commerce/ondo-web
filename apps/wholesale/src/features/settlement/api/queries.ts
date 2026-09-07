"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { apiFetch, apiFetchBody, apiFetchPage, type PageMeta } from "@ondo/api";
import { settlementKeys } from "./keys";
import {
  LEDGER_PAGE_SIZE,
  ORDER_PAGE_SIZE,
  RETAILER_PAGE_SIZE,
} from "../constants";
import {
  toBankAccountView,
  toLedgerView,
  toOrderView,
  toRetailerRow,
} from "../derive";
import type {
  BankAccount,
  BankAccountView,
  LedgerEntryType,
  LedgerView,
  OrderRowView,
  ReceivableLedgerPage,
  ReceivableRetailer,
  RetailerRowView,
  SettlementOrder,
} from "../types";

/**
 * 정산 경로. 훅 1개 = 엔드포인트 1개. 여기 없는 경로는 이 feature가 부르지 않는다.
 *
 * `orders`는 주문 탭과 **같은 path**다 — 스펙이 "정산 탭 [정산 상태] 세그먼트가 같은 스키마 … `retailerId`를
 * 넣으면 확정 주문만"이라고 정산 탭 용도를 명시한다. 키는 이 feature 것이다(feature끼리 import 하지 않는다).
 */
export const SETTLEMENT_PATH = {
  receivableRetailers: "/api/wholesale/receivables/retailers",
  receivables: "/api/wholesale/receivables",
  payments: "/api/wholesale/payments",
  orders: "/api/wholesale/orders",
  bankAccounts: "/api/wholesale/bank-accounts",
  bankAccount: (bankAccountId: number) =>
    `/api/wholesale/bank-accounts/${bankAccountId}`,
} as const;

export interface LedgerQuery {
  retailerId: number;
  /** 구분 필터. `undefined`면 전부(서버 파라미터 생략) */
  entryType: LedgerEntryType | undefined;
}

/**
 * 안에서 `useSuspenseQuery`를 쓴다 — 기다림과 실패는 `QueryBoundary`가 그린다.
 * `select`로 wire를 뷰로 바꿔서 화면은 wire 모양을 모른다.
 */

/**
 * 소매처별 미수. 첫 페이지(100곳)만 — 화면에 페이저가 없다. `sort`는 안 보낸다(형식이 스펙에 없다).
 * 검색은 서버에 없어(스펙) 받은 페이지 안에서 화면이 거른다(`derive.filterRetailers`).
 */
export function useReceivableRetailersQuery() {
  return useSuspenseQuery({
    queryKey: settlementKeys.retailers(),
    queryFn: () =>
      apiFetchPage<ReceivableRetailer>(SETTLEMENT_PATH.receivableRetailers, {
        searchParams: { page: 0, size: RETAILER_PAGE_SIZE },
      }),
    select: (page): { rows: RetailerRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toRetailerRow),
      meta: page.meta,
    }),
  });
}

/**
 * 소매처 하나의 확정 주문(정산 상태·미수 잔액 포함). 정산 상태 표와 배분 표가 **같은 응답**을 본다 —
 * 정산 상태 필터는 서버 파라미터(`settlementStatus`)가 있지만 안 쓴다. 필터마다 키가 갈리면 배분 표가
 * 다른 쿼리를 들어야 하고, 같은 키를 두 경계가 보면 실패했을 때 `다시 시도`가 둘이 된다(wire-order F6).
 */
export function useRetailerOrdersQuery(retailerId: number) {
  return useSuspenseQuery({
    queryKey: settlementKeys.orders(retailerId),
    queryFn: () =>
      apiFetchPage<SettlementOrder>(SETTLEMENT_PATH.orders, {
        searchParams: { retailerId, page: 0, size: ORDER_PAGE_SIZE },
      }),
    select: (page): { rows: OrderRowView[]; meta: PageMeta } => ({
      rows: page.items.map(toOrderView),
      meta: page.meta,
    }),
  });
}

/** 소매처 하나의 원장 한 페이지(최신 100줄) + 전체 잔액(`meta.ledgerBalance`). `from`·`to`·`sort`는 안 보낸다(화면에 없다) */
export function useLedgerQuery(query: LedgerQuery) {
  return useSuspenseQuery({
    queryKey: settlementKeys.ledger(query),
    // 봉투가 `{ data, meta }`인데 `meta`가 `PageMeta`가 아니라(`ledgerBalance`) 본문째 받는다
    queryFn: () =>
      apiFetchBody<ReceivableLedgerPage>(SETTLEMENT_PATH.receivables, {
        searchParams: {
          retailerId: query.retailerId,
          entryType: query.entryType,
          page: 0,
          size: LEDGER_PAGE_SIZE,
        },
      }),
    select: (page): LedgerView => toLedgerView(page),
  });
}

/** 정산 계좌 전부. 페이징 없음(스펙: 계좌는 소수). 순서는 서버(주계좌 먼저 → 등록순) */
export function useBankAccountsQuery() {
  return useSuspenseQuery({
    queryKey: settlementKeys.bankAccounts(),
    queryFn: () => apiFetch<BankAccount[]>(SETTLEMENT_PATH.bankAccounts),
    select: (rows): BankAccountView[] => rows.map(toBankAccountView),
  });
}
