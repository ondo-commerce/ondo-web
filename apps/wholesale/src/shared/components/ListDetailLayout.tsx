import { Panel } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 레이아웃 A — 좌측 목록 + 우측 작업 패널.
 * 주문 탭을 뺀 전 탭이 이 형태다 (Figma 기준 좌 872 / 우 589, gap 16).
 *
 * 우측 폭은 선택 여부와 무관하게 항상 유지한다 — 선택할 때마다 목록 폭이 바뀌면
 * 표의 열 너비가 통째로 재계산돼서 읽던 자리를 놓친다.
 *
 * 높이는 화면에 꽉 맞춘다. 양쪽 패널이 각자 Panel.Body 안에서 스크롤하므로
 * 목록을 아무리 내려도 우측 상세는 제자리에 남는다.
 */
export function ListDetailLayout({
  list,
  detail,
  emptyDetail = "좌측 목록에서 항목을 선택하세요",
}: {
  list: ReactNode;
  /** 선택된 항목의 상세. 없으면 같은 자리에 emptyDetail이 들어간다 */
  detail?: ReactNode;
  /** 선택 전 우측에 놓을 안내. 탭마다 문구가 다르면 넘긴다 */
  emptyDetail?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">{list}</div>
      <div className="flex w-lg shrink-0 flex-col gap-4">
        {detail ?? (
          <Panel className="text-muted-foreground grid flex-1 place-items-center text-sm">
            {emptyDetail}
          </Panel>
        )}
      </div>
    </div>
  );
}
