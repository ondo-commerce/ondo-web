import { Panel } from "@ondo/ui";

/**
 * 아직 내용을 만들지 않은 화면. 라우트와 셸 이동은 살아 있고 본문만 비어 있다.
 * 화면이 생기면 그 page.tsx가 이 한 줄을 자기 뷰 컴포넌트 호출로 바꾼다.
 *
 * 도매(`apps/wholesale`)의 같은 이름 컴포넌트를 복사하지 않았다 — 저쪽은 화면 전체
 * 스크롤이 없어서 `flex-1`로 남은 높이를 채우는데, 소매는 문서형 세로 스크롤이라
 * "남은 높이"가 없다. 여기서는 빈 상자가 납작해지지 않을 최소 높이만 준다.
 */
export function PlaceholderPage({
  title,
  note,
}: {
  title: string;
  /** 왜 비어 있는지 한 줄. 안 주면 공통 문구를 쓴다 */
  note?: string;
}) {
  return (
    <Panel>
      <Panel.Title sub={note ?? "아직 만들지 않은 화면입니다."}>
        {title}
      </Panel.Title>
      <div className="border-border text-muted-foreground grid min-h-60 place-items-center rounded-control border border-dashed text-sm">
        준비 중
      </div>
    </Panel>
  );
}
