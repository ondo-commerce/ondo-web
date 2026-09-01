import type { ReactNode } from "react";

/**
 * 나란한 두 칸(`.f2`). 상호명·대표자명처럼 **짧고 짝인 값**만 이렇게 둔다.
 *
 * 960px 이하에서 한 줄로 편다. 시장 안에서 휴대폰으로 여는 화면이라 두 칸이
 * 나란히 서면 각 칸이 글자 몇 개 폭으로 줄어든다. 값(60rem)은 확정
 * 와이어프레임 `_base.css`의 `@media` 그대로이고, `tablet` 변형은 이미
 * `globals.css`에 정의돼 있다.
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
