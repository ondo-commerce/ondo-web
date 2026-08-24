import { Badge } from "@ondo/ui";
import {
  FULFILLMENT_LABEL,
  FULFILLMENT_TONE,
  LEDGER_ARROW,
  LEDGER_LABEL,
  SETTLEMENT_LABEL,
  SETTLEMENT_TONE,
} from "../constants";
import type {
  FulfillmentStatus,
  LedgerEntryType,
  SettlementStatus,
} from "../types";

/*
 * 정산 탭의 상태 배지 두 종.
 *
 * **`packages/ui`의 `Badge`를 그대로 쓰고 색을 늘리지 않는다**(게이트 G-2·Q2).
 * 여기 있는 건 색이 아니라 **라벨과 tone의 매핑**이다 — 상태값이 늘어나도
 * 화면마다 다른 단어를 쓰지 않게 한 곳에 모으는 것이 이 파일의 목적이다.
 * 도메인 지식(어떤 상태가 진행 중인가)이 있으므로 feature 안에 있고,
 * 두 번째 사용처(주문 탭)가 생기는 PR에서 승격을 판정한다(Rule of Two).
 */

/** 이행 축 배지. 정산 축 값(`미결제` 등)이 이 자리에 들어오지 못하게 타입이 막는다 */
export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <Badge tone={FULFILLMENT_TONE[status]}>{FULFILLMENT_LABEL[status]}</Badge>
  );
}

/** 정산 축 배지. 라벨 3종 고정 */
export function SettlementBadge({ status }: { status: SettlementStatus }) {
  return (
    <Badge tone={SETTLEMENT_TONE[status]}>{SETTLEMENT_LABEL[status]}</Badge>
  );
}

/**
 * 미수원장의 구분 배지.
 *
 * `wholesale_screen_spec.md` §8.1은 이 배지를 "2색 규칙의 유일한 예외"로 허용했지만
 * **게이트 결정이 그 예외를 쓰지 않는 쪽을 택했다.** 그래서 입금과 판매가 같은 회색이고,
 * 구분은 배지 안의 화살표(`↓`/`↑`)와 금액의 부호가 맡는다.
 */
export function LedgerBadge({ entryType }: { entryType: LedgerEntryType }) {
  return (
    <Badge tone="done">
      {LEDGER_ARROW[entryType]}
      {LEDGER_LABEL[entryType]}
    </Badge>
  );
}
