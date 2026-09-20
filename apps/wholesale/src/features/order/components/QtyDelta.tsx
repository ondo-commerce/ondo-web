import { formatNumber } from "@/shared/lib/format";

/**
 * `6 → 10` 형태의 변화 표시. **화살표 오른쪽 숫자만 파랑이다** —
 * 앞은 지금 값, 뒤는 이번 입력을 반영했을 때의 값이라 아직 확정된 값이 아니다.
 * 입력이 없어 값이 그대로면 화살표 자체를 그리지 않는다(숫자 하나만 남는다).
 *
 * **Rule of Two: 주문 탭 안에 둔다.** 처음 쓰는 탭이라 packages/ui로 올리지 않는다.
 */
export function QtyDelta({
  before,
  after,
  muted,
}: {
  before: number;
  after: number;
  /** 변화가 없고 값이 0인 자리(다 나간 라인의 미할당)는 회색으로 죽인다 */
  muted?: boolean;
}) {
  if (after === before) {
    return (
      <span className={muted ? "text-muted-foreground" : undefined}>
        {formatNumber(before)}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap">
      {formatNumber(before)}
      <span className="text-muted-foreground mx-1" aria-hidden>
        →
      </span>
      {/* 화살표는 기호라 낭독되지 않는다. 읽어 줄 말을 따로 남긴다 */}
      <span className="sr-only">에서</span>
      <span className="text-primary">{formatNumber(after)}</span>
      <span className="sr-only">으로</span>
    </span>
  );
}
