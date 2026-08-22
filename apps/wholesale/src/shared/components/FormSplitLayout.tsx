import type { ReactNode } from "react";

/**
 * 레이아웃 B — 가로 2단 등록/수정 폼 + 하단 고정 액션.
 *
 * 원래는 세로로 길게 늘어놓고 우측에 스크롤 스파이 목차를 두는 형태였다.
 * 화면 전체 스크롤을 없애면서 목차가 가리킬 대상 자체가 사라져 2단으로 바꿨다
 * (좌: 상품, 우: 게시글). 두 묶음을 한 화면에서 대조하며 채울 수 있다.
 *
 * 좌우는 1:1이다. 레이아웃 A(목록+상세)의 872/589는 "읽는 목록 + 좁은 상세"라
 * 비대칭이지만, 여기는 양쪽 다 입력하는 폼이라 한쪽을 좁힐 근거가 없다.
 *
 * 액션 버튼이 패널 밖 하단에 고정인 이유: 스크롤이 패널 안에서만 일어나므로
 * 어느 쪽을 얼마나 스크롤했든 제출 버튼은 늘 같은 자리에 있어야 한다.
 */
export function FormSplitLayout({
  left,
  right,
  actions,
}: {
  /** 좌측 단. 보통 상품 폼 패널 */
  left: ReactNode;
  /** 우측 단. 게시글 폼 패널이거나, 아직 켜지 않았다는 안내 패널 */
  right: ReactNode;
  /** 하단 고정 바에 우측 정렬로 놓일 버튼들 */
  actions: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-4">
        {/* 각 단의 자식 패널은 flex-1로 남은 높이를 채운다 */}
        <div className="flex min-w-0 flex-1 flex-col">{left}</div>
        <div className="flex min-w-0 flex-1 flex-col">{right}</div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {actions}
      </div>
    </div>
  );
}
