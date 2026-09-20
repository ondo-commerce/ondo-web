/**
 * 패널 머리에 서는 요약 카드 3칸(확정 와이어프레임 `_base.css` `.stats`).
 *
 * **`features/catalog`의 도매처 홈 통계 3칸을 그대로 올린 것이다.** 정산 화면이
 * 두 번째 사용처가 되면서 Rule of Two에 걸렸다. 도메인 지식이 0이라 `shared/`가
 * 맞고, 소매만 쓰는 모양이라 `packages/ui`는 아니다(`docs/04-component-strategy.md`).
 *
 * 좁아지면 1열로 접힌다 — 세 칸을 유지하면 22px 숫자가 줄바꿈된다.
 */
export interface StatCard {
  /** 카드 라벨 */
  label: string;
  /** 큰 숫자. 이미 `859,000원`처럼 형식이 끝난 문자열을 받는다 — 여기서 계산하지 않는다 */
  value: string;
  /** 보조 한 줄. 없으면 자리를 만들지 않는다 */
  sub?: string | null;
}

export function StatCards({ cards }: { cards: readonly StatCard[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 tablet:grid-cols-1">
      {cards.map(({ label, value, sub }) => (
        <div
          key={label}
          className="border-border rounded-control border px-4 py-3.5"
        >
          <dt className="text-muted-foreground text-body">{label}</dt>
          <dd className="m-0">
            {/* 22px/30 (`_base.css` `.stat .v`). `text-xl`(20px)로는 화면에서 가장
                먼저 읽혀야 할 숫자가 한 단계 작게 선다 — 정산 화면과 도매처 홈이
                같이 걸려 있었다(F6) */}
            <span className="mt-1.5 block text-stat font-medium tabular-nums">
              {value}
            </span>
            {sub ? (
              <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
                {sub}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
