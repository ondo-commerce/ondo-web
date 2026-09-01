import { Badge, cn } from "@ondo/ui";
import { ACCEPT_LABEL } from "../constants";
import type { AcceptStatus } from "../types";

/**
 * 주문 화면 배지의 모양 3종. **색을 늘리지 않는다** — 윤곽/채움/빨간 윤곽뿐이다.
 *
 * - `outline` 진행 중인 것 (`접수됨` · `확정 대기` · `수령 가능` · `부분 출고`)
 * - `fill` 사장이 지금 할 일이 없는 것 (`출고 완료` · `접수 확인 중…` · `담김`)
 * - `warn` 안 된 것 (`접수 안 됨` · `시즌 종료 · 제외` · `게시 내림 · 제외`)
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
 * 한 곳만 쓴다(Rule of Two). 도매도 쓰게 되면 그때 `design(ui)` 이슈를 연다.
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

const ACCEPT_SHAPE: Record<AcceptStatus, BadgeShape> = {
  ACCEPTED: "outline",
  CHECKING: "fill",
  REJECTED: "warn",
};

/**
 * 접수 결과 배지. 표기와 모양이 **상태값 하나**에서 나온다 —
 * 호출부가 문자열을 적으면 화면마다 다른 말이 뜬다(원본 §6-2가 그 사고였다).
 */
export function AcceptStatusBadge({ status }: { status: AcceptStatus }) {
  return (
    <StatusBadge shape={ACCEPT_SHAPE[status]}>
      {ACCEPT_LABEL[status]}
    </StatusBadge>
  );
}
