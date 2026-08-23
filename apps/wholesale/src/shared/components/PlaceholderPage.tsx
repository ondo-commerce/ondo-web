import { Panel } from "@ondo/ui";

/**
 * 아직 화면을 만들지 않은 탭. 라우트와 GNB 이동은 살아 있고 내용만 비어 있다.
 * 화면이 생기면 이 컴포넌트를 지우고 실제 page.tsx를 채운다.
 */
export function PlaceholderPage({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <Panel className="flex-1">
      <Panel.Title sub={note ?? "아직 만들지 않은 화면입니다."}>
        {title}
      </Panel.Title>
      <div className="border-border text-muted-foreground grid flex-1 place-items-center rounded-control border border-dashed text-sm">
        준비 중
      </div>
    </Panel>
  );
}
