import { Badge, cn } from "@ondo/ui";
import { ACCEPT_LABEL, LINE_STATUS_LABEL } from "../constants";
import { orderStatusLabel } from "../derive";
import type { OrderLineStatus, OrderStatus } from "../types";

/**
 * 주문 화면 배지의 모양 3종. **색을 늘리지 않는다** — 윤곽/채움/빨간 윤곽뿐이다.
 *
 * - `outline` 진행 중인 것 (`접수됨` · `확정 대기` · `수령 가능` · `부분 출고`)
 * - `fill` 사장이 지금 할 일이 없는 것 (`출고 완료`)
 * - `warn` 안 된 것 (`접수 안 됨`)
 */
export type BadgeShape = "outline" | "fill" | "warn";

/**
 * 대비를 여기 한 곳에서 지킨다.
 *
 * ① `fill`은 gray-100 면 위에 앉는다. 기본 글자색(gray-500)이면 4.39:1로 AA에
 *    못 미쳐서(셸 회차 F1) `secondary-foreground`(gray-600)로 한 단계 내린다.
 * ② `warn`은 **테두리만 red-500이고 글자는 red-700**이다. red-500 글자는 흰
 *    배경에서 3.81:1이라 글자로는 못 쓰지만(셸 회차 F2) 선으로는 3:1이면 된다.
 *
 * `packages/ui`의 `Badge`에 variant를 더하지 않는다 — 읽기 전용이고 지금은 소매
 * 한 곳만 쓴다(Rule of Two).
 */
export function StatusBadge({
  shape,
  children,
  className,
}: {
  shape: BadgeShape;
  children: string;
  className?: string;
}) {
  return (
    <Badge
      tone={shape === "fill" ? "done" : "active"}
      className={cn(
        shape === "outline" && "border",
        shape === "fill" && "text-secondary-foreground",
        shape === "warn" && "border-destructive text-destructive-strong border",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/**
 * 접수 결과 배지. 된 것과 안 된 것 둘뿐이다 — 스펙의 `PlaceOrderResult.isAccepted`.
 * fixtures 시절의 `접수 확인 중…`은 서버 응답에 없는 상태라 같이 사라졌다.
 */
export function AcceptStatusBadge({ accepted }: { accepted: boolean }) {
  return accepted ? (
    <StatusBadge shape="outline">{ACCEPT_LABEL.accepted}</StatusBadge>
  ) : (
    <StatusBadge shape="warn">{ACCEPT_LABEL.rejected}</StatusBadge>
  );
}

/**
 * 통합 행의 상태 배지. 값은 서버가 정한 `ActionBadge`다.
 *
 * **끝난 것만 채움이다**(`출고 완료`). 나머지는 아직 사장이 뭔가 기다리거나
 * 할 일이 남은 것이라 윤곽으로 둔다 — 색이 아니라 채움 여부가 "끝났는가"를
 * 말한다(게이트 D1: 강조색을 쓰지 않는다).
 */
const ORDER_SHAPE: Record<OrderStatus, BadgeShape> = {
  PENDING_ACCEPT: "outline",
  WAITING_SHIPMENT: "outline",
  READY_TO_PICK_UP: "outline",
  DONE: "fill",
  CANCELLED: "outline",
};

/** 모르는 값은 윤곽 — 끝났다고 단정할 근거가 없다. 표기는 `derive.orderStatusLabel` */
function orderShape(status: OrderStatus): BadgeShape {
  return status in ORDER_SHAPE ? ORDER_SHAPE[status] : "outline";
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusBadge shape={orderShape(status)}>
      {orderStatusLabel(status)}
    </StatusBadge>
  );
}

/**
 * 도매처 건의 상태 배지. **표기는 도매가 준 `label` 그대로**다(스펙 `Status`) —
 * 같은 주문을 두 화면이 다르게 부르면 안 된다. 모양만 `key`로 정한다.
 */
export function LegStatusBadge({
  statusKey,
  label,
}: {
  statusKey: string;
  label: string;
}) {
  return (
    <StatusBadge shape={statusKey === "SHIPPED" ? "fill" : "outline"}>
      {label}
    </StatusBadge>
  );
}

const LINE_SHAPE: Record<OrderLineStatus, BadgeShape> = {
  SHIPPED: "fill",
  READY: "outline",
  BACKORDER: "outline",
  PARTIAL: "outline",
  PENDING: "outline",
  PREPARING: "outline",
  CANCELED: "outline",
};

export function LineStatusBadge({ status }: { status: OrderLineStatus }) {
  return (
    <StatusBadge shape={LINE_SHAPE[status]}>
      {LINE_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
