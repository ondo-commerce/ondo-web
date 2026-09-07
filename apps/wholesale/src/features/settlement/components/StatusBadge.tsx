import { Badge } from "@ondo/ui";
import {
  LEDGER_ARROW,
  LEDGER_LABEL,
  ORDER_STATUS_TONE,
  SETTLEMENT_LABEL,
  SETTLEMENT_TONE,
} from "../constants";
import type { LedgerEntryType, OrderStatus, SettlementStatus } from "../types";

/*
 * 정산 탭의 상태 배지 세 종.
 *
 * **`packages/ui`의 `Badge`를 그대로 쓰고 색을 늘리지 않는다**(게이트 G-2·Q2).
 * 여기 있는 건 색이 아니라 **라벨과 tone의 매핑**이다 — 상태값이 늘어나도
 * 화면마다 다른 단어를 쓰지 않게 한 곳에 모으는 것이 이 파일의 목적이다.
 */

/** 이행 축 배지. 라벨은 서버 `status.label`, 색만 여기서 고른다 */
export function OrderStatusBadge({
  status,
  label,
}: {
  status: OrderStatus;
  label: string;
}) {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{label}</Badge>;
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
