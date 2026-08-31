import type { ReactNode } from "react";

/**
 * 카테고리 바가 붙는 화면만 묶는 그룹 — 홈과 상품 상세 **둘뿐**이다
 * (확정 와이어프레임에서 `cats: on`인 파일이 이 둘이다. 도매처 홈에는 없다).
 *
 * 두 라우트가 같은 줄을 공유하므로 `page.tsx`가 각자 붙이지 않고 여기가 그린다 —
 * 화면마다 붙이면 홈과 상세의 카테고리 줄이 갈라진다.
 * 바 자체는 #84에서 들어온다. 지금은 묶기만 한다.
 */
export default function BrowseLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
