import { Button, Chip, cn } from "@ondo/ui";
import type { ReactNode } from "react";
import { PENDING_TEXT, ROOM_TEXT } from "../constants";
import {
  autoReplySeen,
  bubbleKindOf,
  failureText,
  formatClock,
  senderLabel,
  systemLineText,
} from "../derive";
import type { ChatMessage, PendingMessage } from "../types";

/**
 * 말풍선 최대폭. 1470은 도매와 같은 70%, ≤40rem은 85%(디자인 결정 9) — 390에서 70%면 한 줄에
 * 열 글자 남짓이라 짧은 답도 여러 줄로 꺾인다.
 */
const BUBBLE_WIDTH = "max-w-7/10 phone:max-w-17/20";

/**
 * 메시지 한 줄 — 소매 시점. 나 오른쪽, 도매와 자동 답 왼쪽(`bubbleKindOf`). 도매 `ChatMessageItem`과 짝이다.
 *
 * 낭독기 규칙(도매 디자인 결정 20): 말풍선 앞에 숨긴 "무드온, 10:08: "를 두고 보이는 시각은
 * `aria-hidden`. log 영역은 `aria-live="off"`라 이 글은 사용자가 대화를 훑을 때만 읽힌다.
 */
export function ChatMessageItem({
  message,
  counterpartName,
  ac,
  extra = null,
}: {
  message: ChatMessage;
  counterpartName: string;
  /** 와이어프레임 `data-ac`(`messageAc`) */
  ac: string;
  /**
   * 자동 답 말풍선 안, 본문과 조회 시각 사이에 들어갈 칸 — 되묻기 칩 줄(`ClarifyChoices`)이나 재고 카드
   * (`StockReplyCard`). 방이 판정해서 넘긴다(loop-05b 방향안 A: 답 하나 = 말풍선 하나)
   */
  extra?: ReactNode;
}) {
  const kind = bubbleKindOf(message);
  const time = formatClock(message.sentAt);
  const who = senderLabel(message, counterpartName);

  if (kind === "system") {
    return (
      <div
        role="note"
        data-kind={message.kind}
        data-ac={ac}
        className="border-border-strong text-secondary-foreground text-body flex items-center gap-2 self-center rounded-full border px-3 py-1"
      >
        <span className="sr-only">{`${who}, ${time}: `}</span>
        {systemLineText(message)}
        <span aria-hidden className="text-muted-foreground text-xs">
          {time}
        </span>
      </div>
    );
  }

  const mine = kind === "me";
  return (
    <div
      data-kind={message.kind}
      data-sequence={message.sequence}
      data-sender={message.sender}
      data-client-id={message.clientMessageId ?? undefined}
      data-ac={ac}
      className={cn(
        "flex min-w-0 flex-col gap-1",
        BUBBLE_WIDTH,
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      <span className="sr-only">{`${who}, ${time}: `}</span>
      {kind === "auto" ? (
        <AutoReplyBubble message={message}>{extra}</AutoReplyBubble>
      ) : (
        <Bubble tone={mine ? "me" : "them"}>{message.body}</Bubble>
      )}
      <span
        aria-hidden
        className="text-muted-foreground text-xs leading-4 tabular-nums"
      >
        {time}
      </span>
    </div>
  );
}

/**
 * 아직 sequence가 없는 내 말풍선 — 보내는 중, 못 보냄. 방 맨 아래에 붙는다(도매 디자인 결정 14).
 * 401이면 `다시 보내기`를 빼고 `지우기`만 둔다 — 다시 보내도 401이다.
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
      data-ac={sending ? "S6-1" : "S6-4"}
      className={cn(
        "flex min-w-0 flex-col items-end gap-1 self-end",
        BUBBLE_WIDTH,
      )}
    >
      <span className="sr-only">{`${ROOM_TEXT.me}, ${sending ? PENDING_TEXT.sending : PENDING_TEXT.srFailed}: `}</span>
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
              data-ac="S6-4 S6-6"
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
            data-ac="S6-4"
          >
            {PENDING_TEXT.remove}
          </Button>
        </span>
      )}
    </div>
  );
}

/**
 * 말풍선 면. 내 것은 primary(지금은 임시 회색 — memory "primary 회색은 임시다"), 도매는 secondary.
 * `wrap-anywhere`: 공백 없는 1000자도 블록 폭을 넘지 않게(S5-9). 줄바꿈은 보낸 그대로.
 */
function Bubble({
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
 * 자동 답변(AUTO_REPLY, CLARIFY) — 상대 쪽, 흰 면 + 테두리 + `자동 답변` 칩 + 본문 + (칩 줄 또는 카드) +
 * `HH:mm 조회`(05a 디자인 결정 7, 05b 결정 18). 소매 응답엔 정확 수량이 없다(D31②). 모든 자동 답에 조회
 * 시각을 단다(F12, S7-13).
 */
function AutoReplyBubble({
  message,
  children,
}: {
  message: ChatMessage;
  children: ReactNode;
}) {
  const seen = autoReplySeen(message);
  return (
    <Bubble tone="plain" className="grid gap-2">
      <span className="flex items-center">
        <Chip shape="square" className="h-5 px-2 text-xs">
          {ROOM_TEXT.autoReply}
        </Chip>
      </span>
      <span>{message.body}</span>
      {children}
      {seen ? (
        <span data-ac="S5-6 S7-13" className="text-muted-foreground text-xs">
          {seen}
        </span>
      ) : null}
    </Bubble>
  );
}
