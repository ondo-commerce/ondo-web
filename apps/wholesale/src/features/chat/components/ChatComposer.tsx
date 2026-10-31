"use client";

import { Button, cn, Textarea } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { COMPOSER_TEXT } from "../constants";
import { checkComposer } from "../derive";
import { useRoomDraft } from "../useRoomDraft";

/**
 * 방 아래 입력창. 메시지 목록과 **다른 컴포넌트**이고 `memo`인 이유: 3초 polling이 방을 다시 그려도
 * 입력 글과 커서가 흔들리지 않게(S4-10). 입력 상태는 여기만 갖고, 방별 기억은 `useRoomDraft`가 한다(loop-08b S3).
 *
 * 높이는 84px(min-h-21)에서 글에 맞춰 160px(max-h-40)까지 늘고 그 위는 안에서 스크롤한다
 * (`field-sizing: content`, 디자인 결정 18). 그 속성이 없는 브라우저(Safari 17 이하)는 84px 고정에 안쪽 스크롤.
 *
 * 키(README 키보드 계약): Enter 보내기, Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시, Esc 목록으로(글은 남는다).
 */
export const ChatComposer = memo(function ChatComposer({
  draftKey,
  counterpartName,
  focusTick,
  sessionLost,
  onSend,
  onEscape,
}: {
  /** 쓰던 글을 기억할 키(`draftKey`). null이면 기억하지 않는다. 바뀌면 부르는 쪽이 다시 마운트한다 */
  draftKey: string | null;
  counterpartName: string;
  /** 목록에서 행을 열 때마다 1씩 오른다. 오르면 입력창으로 포커스(S2-6) */
  focusTick: number;
  /** 401 — 쓴 글은 지키고 보내기만 잠근다(D28). 입력창은 읽기 전용, 글은 선택해 복사할 수 있다 */
  sessionLost: boolean;
  onSend: (body: string) => void;
  /** Esc — 포커스를 선택 행으로(S4-11) */
  onEscape: () => void;
}) {
  const {
    text: draft,
    setText: setDraft,
    discard: discardDraft,
  } = useRoomDraft(draftKey);
  const [photoNote, setPhotoNote] = useState(false);
  const check = checkComposer(draft);
  const canSend = !check.blank && !check.over && !sessionLost;

  // packages/ui Textarea가 ref를 받지 않아 감싼 상자에서 찾는다
  const boxRef = useRef<HTMLDivElement>(null);
  const focusInput = () => boxRef.current?.querySelector("textarea")?.focus();

  useEffect(() => {
    if (focusTick === 0) return;
    boxRef.current?.querySelector("textarea")?.focus();
  }, [focusTick]);

  /* 보내면 입력창은 비우고 포커스는 남긴다(S4-1). 비우는 게 연타 방지다 — 두 번째 Enter·클릭은 빈 칸을 본다(S4-3).
     React는 키·클릭 같은 사용자 이벤트의 state를 다음 이벤트 전에 반영한다 */
  const submit = () => {
    if (!canSend) return;
    onSend(draft.trim());
    discardDraft();
    setPhotoNote(false);
    focusInput();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글 조합을 끝내는 Enter는 조합만 끝낸다(S4-2). keyCode 229는 isComposing을 안 주는 브라우저용
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  /* 사진 붙여넣기(S4-9). textarea는 원래 사진을 안 받으니 막을 것도 없다 — 안내만 하고 글은 그대로 */
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const hasImage = [...event.clipboardData.items].some(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (hasImage) setPhotoNote(true);
  };

  const noteId = useId();
  const note = sessionLost ? (
    <span
      role="alert"
      data-ac="S4-7"
      className="border-destructive text-destructive-strong flex flex-1 items-center gap-1.5 rounded-control border px-3 py-2 text-sm"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      {COMPOSER_TEXT.sessionLost}
    </span>
  ) : check.overMessage ? (
    <span data-ac="S4-4" className="text-destructive-strong">
      {check.overMessage}
    </span>
  ) : photoNote ? (
    <span role="status" data-ac="S4-9">
      {COMPOSER_TEXT.photo}
    </span>
  ) : null;
  const described = note === null ? undefined : noteId;

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
          readOnly={sessionLost}
          aria-invalid={check.over || undefined}
          aria-describedby={described}
          onChange={(e) => {
            setDraft(e.target.value);
            setPhotoNote(false);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          data-ac="S4-1 S4-2 S4-10 S4-11"
          className={cn(
            "field-sizing-content max-h-40 min-w-0 flex-1 resize-none",
            check.over && "border-destructive",
            sessionLost && "bg-muted",
          )}
        />
        <Button
          type="button"
          disabled={!canSend}
          aria-describedby={described}
          /* 마우스로 눌러도 포커스는 입력창에 남는다(S4-1). 안 막으면 누르는 순간 버튼이 포커스를 가져가고,
             보낸 뒤 비활성이 되면 포커스가 페이지로 떨어진다 */
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          data-ac="S4-1 S4-3 S4-4"
        >
          {COMPOSER_TEXT.send}
        </Button>
      </div>
      <p
        id={noteId}
        className="text-muted-foreground flex min-h-4 items-start gap-2 text-xs leading-4"
      >
        {note ?? (check.counter === null ? COMPOSER_TEXT.hint : null)}
        {check.counter !== null ? (
          <span className="ml-auto tabular-nums">{check.counter}</span>
        ) : null}
      </p>
    </div>
  );
});
