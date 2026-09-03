import type { ReactNode } from "react";

/**
 * 나란한 두 칸(`.f2`). 상호명·대표자 이름처럼 **짧고 짝인 값**만 이렇게 둔다.
 *
 * 960px 이하에서 한 줄로 편다(`tablet` 변형 — `globals.css`에 `<=`로 정의돼
 * 있다). 값은 확정 와이어프레임 `_base.css`의 `@media` 그대로다.
 *
 * 자식의 아래 여백은 호출부가 `mb-0`으로 지운다 — 여기 gap과 겹치면 두 칸이
 * 한 줄로 펴졌을 때 줄 간격만 두 배가 된다.
 */
export function TwoCol({ children }: { children: ReactNode }) {
  return (
    <div className="tablet:grid-cols-1 mb-4 grid grid-cols-2 gap-4">
      {children}
    </div>
  );
}
