"use client";

import { Button, Textarea } from "@ondo/ui";
import { useEffect, useRef, useState } from "react";
import { COMPOSER_TEXT } from "../constants";

/**
 * 방 아래 입력창. 메시지 목록과 **다른 컴포넌트**인 이유: 3초 polling이 방을 다시 그려도 입력 글과
 * 커서가 흔들리지 않게(S4-10). 입력 상태는 여기만 갖는다.
 *
 * 높이는 84px(min-h-21)에서 글에 맞춰 160px(max-h-40)까지 늘고 그 위는 안에서 스크롤한다
 * (`field-sizing: content`, 디자인 결정 18). 그 속성이 없는 브라우저(Safari 17 이하)는 84px 고정에 안쪽 스크롤.
 *
 * 보내기는 #265에서 붙는다. 이 커밋에선 칸과 키보드 진입(S2-6)까지만 있다.
 */
export function ChatComposer({
  counterpartName,
  focusTick,
}: {
  counterpartName: string;
  /** 목록에서 행을 열 때마다 1씩 오른다. 오르면 입력창으로 포커스(S2-6) */
  focusTick: number;
}) {
  const [draft, setDraft] = useState("");
  // packages/ui Textarea가 ref를 받지 않아 감싼 상자에서 찾는다
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusTick === 0) return;
    boxRef.current?.querySelector("textarea")?.focus();
  }, [focusTick]);

  return (
    <div
      data-ac="S3-2"
      className="border-border grid shrink-0 gap-1.5 border-t pt-3"
    >
      <div ref={boxRef} className="flex items-end gap-2">
        <Textarea
          rows={3}
          aria-label={COMPOSER_TEXT.label}
          placeholder={`${counterpartName}${COMPOSER_TEXT.placeholderSuffix}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-ac="S4-1 S4-2 S4-10 S4-11"
          className="field-sizing-content max-h-40 min-w-0 flex-1 resize-none"
        />
        <Button type="button" disabled data-ac="S4-4">
          {COMPOSER_TEXT.send}
        </Button>
      </div>
      <p className="text-muted-foreground min-h-4 text-xs leading-4">
        {COMPOSER_TEXT.hint}
      </p>
    </div>
  );
}
