import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * 경고 배너 — 흰 바탕 + 빨간 테두리 + 빨간 글자(`.notice.warn`).
 *
 * `packages/ui`의 `Notice`에 경고 변형이 없어서 여기 둔다. 사용처가 이 화면
 * 하나뿐이라 `shared/`로 올리지 않는다 (Rule of Two).
 *
 * 색에만 기대지 않는다. 이 빨강(red-500)은 흰 바탕에서 AA에 못 미치는데
 * (`01-pm.md` Q5) 토큰을 고치는 건 이번 범위 밖이다. 그래서 세모 아이콘과
 * `role="alert"`, 그리고 화면 낭독기용 `경고`를 같이 둔다 — 색이 흐려도
 * "여기가 문제다"가 남는다.
 */
export function WarnNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive text-destructive bg-card flex items-start gap-2 rounded-control border px-4 py-3 text-body"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="sr-only">경고: </span>
        {children}
      </span>
    </div>
  );
}

/**
 * 경고 배지(`.badge.warn`) — 흰 바탕에 빨간 테두리·글자.
 *
 * `packages/ui`의 `Badge`는 tone이 `active`/`done` 둘뿐이라 여기서 그린다.
 * 배지도 색 하나로 읽히지 않도록 글자가 `승인 거절`이라고 그대로 말한다.
 */
export function WarnBadge({ children }: { children: ReactNode }) {
  return (
    <span className="border-destructive text-destructive bg-card inline-flex h-6.5 items-center justify-center rounded-button border px-2.5 text-xs whitespace-nowrap">
      {children}
    </span>
  );
}
