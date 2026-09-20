import { cn } from "@ondo/ui";
import { formatNumber } from "@/shared/lib/format";

/**
 * 배분 표 위의 카운터 3개. **이 탭이 첫 사용처라 `packages/ui`로 올리지 않는다**
 * (Rule of Two — 두 번째 탭이 같은 모양을 쓰는 PR에서 승격을 판정한다).
 *
 * 셋은 반드시 맞물린다 — `미배분 + 배분 완료 = 총 미송 수량`이고 `미배분 = Σ 잔여 미송`이다.
 * 그래서 **여기서 아무것도 계산하지 않는다.** 세 값은 전부 derive가 만든 것을 받기만 한다.
 * 한 곳에서라도 다시 세면 표의 합계와 갈릴 수 있다.
 *
 * 색이 셋의 성격을 나눈다: 미배분은 아직 못 준 것(회색), 가용재고는 상한(파랑),
 * 배분 완료는 지금 정한 결론(검정).
 */
export function AllocationCounterBar({
  unallocated,
  assignable,
  allocated,
}: {
  /** 미배분 = 총 미송 − 배분 완료 */
  unallocated: number;
  /** 가용재고. **배분 수량을 아무리 고쳐도 움직이지 않는 고정 상한이다** */
  assignable: number;
  /** 배분 완료 = Σ 배분 수량 */
  allocated: number;
}) {
  return (
    <div className="flex items-center justify-end gap-4 py-3">
      <Counter
        label="미배분"
        value={unallocated}
        className="text-muted-foreground"
      />
      <Divider />
      <Counter label="가용재고" value={assignable} className="text-primary" />
      <Divider />
      <Counter
        label="배분 완료"
        value={allocated}
        className="text-foreground"
      />
    </div>
  );
}

function Counter({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-body">{label}</span>
      <span className={cn("text-lg font-medium tabular-nums", className)}>
        {formatNumber(value)}
      </span>
    </span>
  );
}

/** 얇은 세로선. 숫자 셋이 각각 다른 값이라는 걸 색보다 먼저 알리는 구분자다 */
function Divider() {
  return <span className="bg-border h-5 w-px shrink-0" aria-hidden />;
}
