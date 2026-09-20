import type { ReactNode } from "react";

export interface SummaryItem {
  label: string;
  value: ReactNode;
}

/**
 * 신청 요약 정의 목록(`.dl.wide`). **라벨 120px 고정 + 열 간격 24px.** 간격을 빼면
 * 값이 라벨에 붙어 두 열이 한 덩어리로 읽힌다(`retail-account` F4가 이 간격이 0이라
 * 걸렸다). `tabular-nums`는 사업자 등록번호와 신청 일시가 세로로 붙어 있어서다.
 */
export function SummaryList({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="text-body space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex gap-6">
          <dt className="text-muted-foreground w-30 shrink-0">{item.label}</dt>
          <dd className="min-w-0 flex-1 tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
