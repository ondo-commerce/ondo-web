"use client";

import { Button, cn, Textarea } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { COMPOSER_TEXT } from "../constants";
import { checkComposer } from "../derive";

/**
 * 방 아래 입력창. 도매 `ChatComposer`와 짝이다. 메시지 목록과 **다른 컴포넌트**이고 `memo`인 이유:
 * polling이 방을 다시 그려도 입력 글과 커서가 흔들리지 않게(S6-9). 입력 상태는 여기만 갖는다.
 *
 * 높이는 84px(≤40rem 66px, 디자인 결정 9)에서 글에 맞춰 160px(max-h-40)까지 늘고 그 위는 안에서
 * 스크롤한다(`field-sizing: content`). 늘어난 만큼 메시지 영역이 줄어든다 — 블록 높이는 고정이다.
 *
 * 키(와이어프레임 README): Enter 보내기, Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시. 목록이 없어
 * 도매의 Esc(목록으로)는 없다. 방을 열면 입력창에 포커스.
 */
export const ChatComposer = memo(function ChatComposer({
  counterpartName,
  sessionLost,
  onSend,
}: {
  counterpartName: string;
  /** 401 — 쓴 글은 지키고 보내기만 잠근다(D28). 입력창은 읽기 전용, 글은 선택해 복사할 수 있다(S6-5) */
  sessionLost: boolean;
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [photoNote, setPhotoNote] = useState(false);
  const check = checkComposer(draft);
  const canSend = !check.blank && !check.over && !sessionLost;

  // packages/ui Textarea가 ref를 받지 않아 감싼 상자에서 찾는다
  const boxRef = useRef<HTMLDivElement>(null);
  const focusInput = () => boxRef.current?.querySelector("textarea")?.focus();

  useEffect(() => {
    boxRef.current?.querySelector("textarea")?.focus();
  }, []);

  /* 보내면 입력창은 비우고 포커스는 남긴다(S6-1). 비우는 게 연타 방지다 — 두 번째 Enter·클릭은 빈 칸을
     본다(S6-2). React는 키·클릭 같은 사용자 이벤트의 state를 다음 이벤트 전에 반영한다 */
  const submit = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
    setPhotoNote(false);
    focusInput();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글 조합을 끝내는 Enter는 조합만 끝낸다(S6-2). keyCode 229는 isComposing을 안 주는 브라우저용
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  /* 사진 붙여넣기(S6-12). textarea는 원래 사진을 안 받으니 막을 것도 없다 — 안내만 하고 글은 그대로 */
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
      data-ac="S6-5"
      className="border-destructive text-destructive-strong flex flex-1 items-center gap-1.5 rounded-control border px-3 py-2 text-sm"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      {COMPOSER_TEXT.sessionLost}
    </span>
  ) : check.overMessage ? (
    <span data-ac="S6-3" className="text-destructive-strong">
      {check.overMessage}
    </span>
  ) : photoNote ? (
    <span role="status" data-ac="S6-12">
      {COMPOSER_TEXT.photo}
    </span>
  ) : null;

  return (
    <div
      data-ac="S5-9"
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
          aria-describedby={noteId}
          onChange={(e) => {
            setDraft(e.target.value);
            setPhotoNote(false);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          data-ac="S6-1 S6-2 S6-9"
          className={cn(
            "field-sizing-content max-h-40 min-w-0 flex-1 resize-none phone:min-h-16.5",
            check.over && "border-destructive",
            sessionLost && "bg-muted",
          )}
        />
        <Button
          type="button"
          disabled={!canSend}
          aria-describedby={noteId}
          /* 마우스로 눌러도 포커스는 입력창에 남는다(S6-1). 안 막으면 누르는 순간 버튼이 포커스를
             가져가고, 보낸 뒤 비활성이 되면 포커스가 페이지로 떨어진다 */
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          data-ac={sessionLost ? "S6-5" : "S6-3"}
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
