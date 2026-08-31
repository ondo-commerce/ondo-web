import type { ReactNode } from "react";

export interface SummaryItem {
  label: string;
  value: ReactNode;
}

/**
 * 신청 요약 정의 목록(`.dl.wide`). 라벨 120px 고정 + 값이 남은 폭.
 *
 * 값에 `tabular-nums`를 주는 이유: 사업자등록번호와 신청 일시가 세로로 붙어
 * 있어서 자릿수 폭이 다르면 줄마다 숫자가 어긋나 보인다.
 *
 * 값을 오른쪽으로 밀지 않는다 — 확정 와이어프레임의 `.dl.wide dd`가 왼쪽
 * 정렬이다. 라벨 폭이 고정이라 값의 시작점이 이미 한 줄로 맞는다.
 */
export function SummaryList({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="space-y-2.5 text-body">
      {items.map((item) => (
        <div key={item.label} className="flex">
          <dt className="text-muted-foreground w-30 shrink-0">{item.label}</dt>
          <dd className="min-w-0 flex-1 tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
