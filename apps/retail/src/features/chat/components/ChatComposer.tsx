"use client";

import { Button, cn, Textarea, ToggleChip } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent, Ref } from "react";
import {
  memo,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { CHATS_HREF, COMPOSER_TEXT, STOCK_TEXT } from "../constants";
import { checkComposer } from "../derive";
import { useRoomDraft } from "../useRoomDraft";

/**
 * 말풍선이 입력창에 글을 넘기는 통로(loop-12 §4-2 3). 입력 글은 이 컴포넌트만 들고 있어(memo, S6-9) 방이 손잡이로
 * 부른다. `saveNow`는 붙인 뒤 바로 다른 화면으로 가는 갈래(403 승인 링크)
 */
export type ComposerAppend = (body: string, saveNow: boolean) => void;

/**
 * 방 아래 입력창. 도매 `ChatComposer`와 짝이다. 메시지 목록과 **다른 컴포넌트**이고 `memo`인 이유:
 * polling이 방을 다시 그려도 입력 글과 커서가 흔들리지 않게(S6-9). 입력 상태는 여기만 갖고, 방별 기억은
 * `useRoomDraft`가 한다(loop-08e S2-2). 키는 마운트 때만 읽는다 — 방이 바뀌면 `ChatBlock`의 `key={roomId}`가
 * 이 컴포넌트를 다시 마운트한다.
 *
 * 높이는 84px(≤40rem 66px, 디자인 결정 9)에서 글에 맞춰 160px(max-h-40)까지 늘고 그 위는 안에서
 * 스크롤한다(`field-sizing: content`). 늘어난 만큼 메시지 영역이 줄어든다 — 블록 높이는 고정이다.
 *
 * 키(와이어프레임 README): Enter 보내기, Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시. 목록이 없어
 * 도매의 Esc(목록으로)는 없다. 방을 열면 입력창에 포커스.
 */
export const ChatComposer = memo(function ChatComposer({
  draftKey,
  counterpartName,
  focusTick,
  sessionLost,
  leaving = false,
  onSend,
  askBusy,
  onAsk,
  appendRef,
  closed,
}: {
  /** 쓰던 글을 기억할 키(`draftKey`). null이면 기억하지 않는다 */
  draftKey: string | null;
  counterpartName: string;
  /** `새 메시지 N개` 버튼을 누르면 1씩 오른다. 오르면 입력창으로 포커스(loop-08d §4-4 4) */
  focusTick: number;
  /** 401 — 쓴 글은 지키고 보내기만 잠근다(D28). 입력창은 읽기 전용, 글은 선택해 복사할 수 있다(S6-5) */
  sessionLost: boolean;
  /**
   * 로그아웃 응답 대기(loop-08e §4-2 9, S2-15). 읽기 전용과 보내기 잠금은 끊김과 같고 안내 줄은 없다 — 로그인이 끊긴 게
   * 아니라 나가는 중이다. 모양은 기존 readOnly 그대로(새 모양 0)
   */
  leaving?: boolean;
  onSend: (body: string) => void;
  /**
   * 맨 위 줄 `재고 문의` 칩(loop-05b S8-1, 디자인 결정 21). null이면 줄 자체가 없다 — 상품 상세에서 연 방이
   * 아니다. true면 보내는 중(스피너 + disabled + aria-busy). 원시값으로 받는 이유: 이 컴포넌트는 `memo`라
   * 객체를 받으면 polling마다 다시 그려진다
   */
  askBusy: boolean | null;
  /** 칩 보내기. 입력창 글은 건드리지 않는다 — 따로 보내는 말이다(S8-2) */
  onAsk: () => void;
  /** 영구 실패 말풍선 `입력창으로`, `승인 상태 보기`가 부른다(`ComposerAppend`). 같은 ref 객체라 memo를 깨지 않는다 */
  appendRef: Ref<ComposerAppend>;
  /**
   * 보내기 404로 닫힌 방(loop-12 Q3, `roomClosedOf`). 잠금 모양은 끊김과 같고(쓴 글은 남는다, D28) 안내 줄은 닫힌 방
   * 줄이 끊김 줄보다 앞선다 — 재로그인해도 그 방엔 못 보낸다
   */
  closed: boolean;
}) {
  const {
    text: draft,
    setText: setDraft,
    append: appendDraft,
    discard: discardDraft,
  } = useRoomDraft(draftKey);
  /* 붙인 뒤 포커스를 입력창 끝으로(§4-2 3). 값이 그려진 뒤에 커서를 놓아야 해서 박자로 넘긴다 */
  const [caretTick, setCaretTick] = useState(0);
  useImperativeHandle(
    appendRef,
    () => (body: string, saveNow: boolean) => {
      appendDraft(body, saveNow);
      setPhotoNote(false);
      setCaretTick((t) => t + 1);
    },
    [appendDraft],
  );
  const [photoNote, setPhotoNote] = useState(false);
  const check = checkComposer(draft);
  const locked = sessionLost || leaving || closed;
  const canSend = !check.blank && !check.over && !locked;

  // packages/ui Textarea가 ref를 받지 않아 감싼 상자에서 찾는다
  const boxRef = useRef<HTMLDivElement>(null);
  const focusInput = () => boxRef.current?.querySelector("textarea")?.focus();

  /* 방을 열 때(0) 한 번, 그 뒤 박자가 오를 때마다. 방을 열 때는 커서를 글 끝에 둔다(S2-2 ①) — 되살린 글
     뒤에 이어 쓰는 게 보통이고, 브라우저마다 첫 포커스의 커서 자리가 달라 맡기지 않는다. 박자(`새 메시지` 버튼)
     때는 사장이 둔 커서를 그대로 둔다 */
  useEffect(() => {
    const input = boxRef.current?.querySelector("textarea");
    if (!input) return;
    input.focus();
    if (focusTick === 0)
      input.setSelectionRange(input.value.length, input.value.length);
  }, [focusTick]);

  useEffect(() => {
    if (caretTick === 0) return;
    const input = boxRef.current?.querySelector("textarea");
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [caretTick]);

  /* 보내면 입력창은 비우고 포커스는 남긴다(S6-1). 비우는 게 연타 방지다 — 두 번째 Enter·클릭은 빈 칸을
     본다(S6-2). React는 키·클릭 같은 사용자 이벤트의 state를 다음 이벤트 전에 반영한다 */
  const submit = () => {
    if (!canSend) return;
    onSend(draft.trim());
    discardDraft();
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
  const note = closed ? (
    <span
      role="status"
      data-ac="12:S1-9 12:S1-10"
      className="border-border-strong text-secondary-foreground flex flex-1 flex-wrap items-center gap-x-1.5 rounded-control border px-3 py-2 text-sm"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      {COMPOSER_TEXT.closed}
      <Link
        href={CHATS_HREF}
        data-ac="12:S1-9 12:S1-10"
        className="text-foreground phone:h-11 inline-flex items-center underline"
      >
        {COMPOSER_TEXT.closedLink}
      </Link>
    </span>
  ) : sessionLost ? (
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

  /* 칩을 눌러도 입력창의 글과 커서는 그대로다(S8-2). 마우스는 mousedown을 막아 포커스가 입력창에 남고,
     키보드로 누른 경우엔 칩이 곧 disabled가 되어 포커스가 페이지로 떨어지니 입력창으로 돌려준다
     (textarea는 포커스를 잃어도 선택 범위를 기억한다) */
  const ask = () => {
    if (askBusy !== false || locked) return;
    onAsk();
    focusInput();
  };

  return (
    <div
      data-ac="S5-9"
      className="border-border grid shrink-0 gap-1.5 border-t pt-3"
    >
      {askBusy === null ? null : (
        <div data-ac="S8-1 S8-11" className="flex">
          <ToggleChip
            /* 토글이 아니라 한 번 보내는 버튼이라 aria-pressed를 뺀다. 모양만 ToggleChip(결정 21) */
            aria-pressed={undefined}
            disabled={askBusy || locked}
            aria-busy={askBusy || undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={ask}
            data-ac="S8-1 S8-2"
            className="phone:h-11 phone:px-3"
          >
            {askBusy ? (
              <span
                aria-hidden
                className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
              />
            ) : null}
            {STOCK_TEXT.ask}
          </ToggleChip>
        </div>
      )}
      <div ref={boxRef} className="flex items-end gap-2">
        <Textarea
          rows={3}
          aria-label={COMPOSER_TEXT.label}
          placeholder={`${counterpartName}${COMPOSER_TEXT.placeholderSuffix}`}
          value={draft}
          readOnly={locked}
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
            locked && "bg-muted",
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
