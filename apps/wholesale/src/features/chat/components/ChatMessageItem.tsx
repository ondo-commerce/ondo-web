import { Button, Chip, cn } from "@ondo/ui";
import type { ReactNode } from "react";
import { PENDING_TEXT, ROOM_TEXT } from "../constants";
import {
  bubbleKindOf,
  factLineText,
  failureText,
  formatClock,
  handoffReasonOf,
  senderLabel,
  toClarifyChoicesView,
  toFactsView,
} from "../derive";
import type { ChatMessage, PendingMessage } from "../types";

/**
 * 메시지 한 줄. 모양은 `bubbleKindOf`가 정한다(모르는 kind도 여기서 TEXT로 떨어진다).
 *
 * 낭독기 규칙(디자인 결정 20): 말풍선 앞에 숨긴 "봄봄상회, 10:38: "를 두고 보이는 시각은
 * `aria-hidden`. log 영역은 `aria-live="off"`라 이 글은 사용자가 대화를 훑을 때만 읽힌다 —
 * 새 메시지 알림은 방 패널의 live 영역 한 곳이 맡는다.
 */
export function ChatMessageItem({
  message,
  counterpartName,
  ac = "S3-1",
  nowMs,
  readMark = false,
}: {
  message: ChatMessage;
  counterpartName: string;
  /** 와이어프레임 `data-ac`. polling으로 새로 붙은 말풍선은 S3-3 S3-4가 더 붙는다(QA F7) */
  ac?: string;
  /** 조회 시각이 오늘인지 가르는 지금 시각(#302 S3-5). 방이 1분 tick 시각을 넘긴다(리뷰 M4) */
  nowMs: number;
  /** 상대가 여기까지 읽었다 — 읽힌 내 쪽 메시지 중 가장 아래 하나에만 true(`readMarkerSequence`, loop-08 S3) */
  readMark?: boolean;
}) {
  const kind = bubbleKindOf(message);
  const time = formatClock(message.sentAt);
  const who = senderLabel(message, counterpartName);

  if (kind === "system") {
    const reason = handoffReasonOf(message);
    const pill = (
      <>
        <span className="sr-only">{`${who}, ${time}: `}</span>
        {message.body}
        <span aria-hidden className="text-muted-foreground text-xs">
          {time}
        </span>
      </>
    );
    const pillClass =
      "border-border-strong text-secondary-foreground text-body flex items-center gap-2 rounded-full border px-3 py-1";
    /* 이유가 없으면 지금 화면 그대로 — 알약 하나(디자인 결정 42) */
    if (reason === null)
      return (
        <div
          role="note"
          data-kind={message.kind}
          data-ac={ac}
          className={cn(pillClass, "self-center")}
        >
          {pill}
        </div>
      );
    /* 알약 + 아래 이유 한 줄을 note 하나로 묶는다 — 낭독은 한 번(결정 39). 폭을 70%로 막으면 좁은 방에서
       알약이 두 줄로 접혀 묶음은 방 폭까지 연다. 이유가 길어도 줄바꿈만, 말줄임 없음 */
    return (
      <div
        role="note"
        data-kind={message.kind}
        data-reason={message.handoff?.reason}
        data-ac={ac}
        className="flex max-w-full flex-col items-center gap-1 self-center"
      >
        <span className={pillClass}>{pill}</span>
        <span
          data-ac="S3-1"
          data-reason-text
          className="text-secondary-foreground text-body text-center wrap-anywhere"
        >
          {reason}
        </span>
      </div>
    );
  }

  const mine = kind !== "them";
  return (
    <div
      data-kind={message.kind}
      data-sequence={message.sequence}
      data-client-id={message.clientMessageId ?? undefined}
      data-ac={ac}
      className={cn(
        "flex max-w-7/10 min-w-0 flex-col gap-1",
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      <span className="sr-only">{`${who}, ${time}: `}</span>
      {kind === "auto" || kind === "clarify" ? (
        <AutoReplyBubble
          message={message}
          clarify={kind === "clarify"}
          nowMs={nowMs}
        />
      ) : (
        <Bubble tone={mine ? "me" : "them"}>{message.body}</Bubble>
      )}
      {/* 시각 줄. `읽음`은 이 줄 안 시각 왼쪽이다(디자인 결정 47) — 새 줄로 두면 값이 바뀔 때 말풍선이 16px
          늘어 읽던 자리가 밀린다. 보이는 글자는 시각과 같이 aria-hidden, 낭독은 아래 숨긴 ", 읽음" */}
      <span
        aria-hidden
        className="text-muted-foreground flex gap-1 text-xs leading-4 tabular-nums"
      >
        {readMark ? (
          <span className="text-secondary-foreground" data-ac="S3-2">
            {ROOM_TEXT.read}
          </span>
        ) : null}
        {time}
      </span>
      {readMark ? (
        <span className="sr-only" data-ac="S3-4">
          {ROOM_TEXT.readSr}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 아직 sequence가 없는 내 말풍선 — 보내는 중, 못 보냄. 방 맨 아래에 붙는다(디자인 결정 14).
 *
 * 보내는 중은 말풍선 대비를 그대로 두고 시각 자리에 스피너 + 글(결정 9 — 흐리게 하면 흰 글자가 2.4:1).
 * 못 보냄은 흰 면 + destructive 선 + 문구(업로드 실패 칸과 같은 규칙). 401이면 `다시 보내기`를 빼고
 * `지우기`만 둔다 — 다시 보내도 401이다(결정 10).
 */
export function PendingItem({
  item,
  sessionLost,
  onRetry,
  onRemove,
}: {
  item: PendingMessage;
  sessionLost: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const sending = item.status === "sending";
  return (
    <div
      aria-busy={sending || undefined}
      data-client-id={item.clientMessageId}
      data-pending={item.status}
      data-ac={sending ? "S4-1" : "S4-5"}
      className="flex max-w-7/10 min-w-0 flex-col items-end gap-1 self-end"
    >
      <span className="sr-only">{`${ROOM_TEXT.me}, ${sending ? PENDING_TEXT.srSending : PENDING_TEXT.srFailed}: `}</span>
      <Bubble tone={sending ? "me" : "failed"}>{item.body}</Bubble>
      {sending ? (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs leading-4">
          <span
            aria-hidden
            className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
          />
          {PENDING_TEXT.sending}
        </span>
      ) : (
        <span
          role="alert"
          className="text-destructive-strong flex items-center gap-1.5 text-xs leading-4"
        >
          {failureText(item.failure)}
          {sessionLost || item.failure === "session" ? null : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-xs underline"
              onClick={onRetry}
              data-ac="S4-5 S4-8"
            >
              {PENDING_TEXT.retry}
            </Button>
          )}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-xs underline"
            onClick={onRemove}
            data-ac="S4-5"
          >
            {PENDING_TEXT.remove}
          </Button>
        </span>
      )}
    </div>
  );
}

/**
 * 말풍선 면. 내 것은 primary(지금은 임시 회색 — memory "primary 회색은 임시다"), 소매는 secondary.
 * `wrap-anywhere`: 공백 없는 1000자도 방 폭을 넘지 않게(S4-4). 줄바꿈은 보낸 그대로.
 */
export function Bubble({
  tone,
  className,
  children,
}: {
  tone: "me" | "them" | "plain" | "failed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-full rounded-control px-3 py-2 text-sm leading-5 whitespace-pre-wrap wrap-anywhere",
        tone === "me" && "bg-primary text-primary-foreground",
        tone === "them" && "bg-secondary text-foreground",
        tone === "plain" && "bg-card text-foreground border-border border",
        tone === "failed" &&
          "bg-card text-foreground border-destructive border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 자동 답변과 되묻기 — 내 쪽, 흰 면 + 테두리 + `자동 답변` 칩(디자인 결정 6, 7).
 * 근거 칸은 도매 화면에만 있다: 정확 수량과 "소매처가 본 구간"을 같이 보여 사장이 소매처가 무엇을 봤는지 안다.
 * 값이 없는 되묻기도 근거 칸 위 선과 조회 시각 줄은 있다(디자인 결정 26).
 * 되묻기는 본문 아래, 근거 칸 위에 소매에게 나간 보기를 **그냥 글자로** 한 줄 둔다(#296 S13-1, 디자인 결정 37).
 * 소매가 고르는 것이라 도매에선 누를 수 없다 — button, 링크, 탭 정지가 없다. 05b-1의 "그리지 않음"(결정 26)을 바꿨다.
 * 미송 되묻기 보기는 "보기" 이름표 아래 한 보기 한 줄이다(#299, 디자인 결정 38).
 */
function AutoReplyBubble({
  message,
  clarify,
  nowMs,
}: {
  message: ChatMessage;
  clarify: boolean;
  nowMs: number;
}) {
  const facts = toFactsView(message.autoReply, nowMs);
  const choices = clarify ? toClarifyChoicesView(message.autoReply) : null;
  return (
    <Bubble tone="plain" className="grid gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Chip shape="square" className="h-5 px-2 text-xs">
          {ROOM_TEXT.autoReply}
        </Chip>
        {clarify ? ROOM_TEXT.clarify : null}
      </span>
      <span>{message.body}</span>
      {choices?.mode === "inline" ? (
        <span data-ac="S13-1" className="text-secondary-foreground text-body">
          {choices.text}
        </span>
      ) : null}
      {/* 미송 보기는 한 보기 한 줄(디자인 결정 38). 이름표는 한 번만 — 줄마다 붙이면 보기 글자보다 눈에 먼저 든다 */}
      {choices?.mode === "list" ? (
        <span data-ac="S4-1 S4-2" className="grid gap-0.5">
          <span className="text-muted-foreground text-xs">
            {ROOM_TEXT.choicesLabel}
          </span>
          {choices.items.map((item, i) => (
            <span
              key={`${i}-${item}`}
              data-ac="S4-1"
              className="text-secondary-foreground text-body"
            >
              {item}
            </span>
          ))}
        </span>
      ) : null}
      {facts ? (
        <span className="border-border text-secondary-foreground text-body grid gap-0.5 border-t pt-2">
          {facts.lines.map((line, n) => (
            <span
              key={factLineText(line)}
              data-ac={facts.lineAc[n] ?? undefined}
            >
              {line.map((part, i) =>
                part.strong ? (
                  <b
                    key={i}
                    className="text-foreground font-medium tabular-nums"
                  >
                    {part.text}
                  </b>
                ) : (
                  part.text
                ),
              )}
            </span>
          ))}
          <span
            data-ac={facts.seenAc}
            className="text-muted-foreground text-xs"
          >
            {facts.seen}
          </span>
        </span>
      ) : null}
    </Bubble>
  );
}
