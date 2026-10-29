import { Button, Chip, cn } from "@ondo/ui";
import type { ReactNode } from "react";
import { PENDING_TEXT, ROOM_TEXT } from "../constants";
import {
  bubbleKindOf,
  factLineText,
  failureText,
  formatClock,
  senderLabel,
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
}: {
  message: ChatMessage;
  counterpartName: string;
  /** 와이어프레임 `data-ac`. polling으로 새로 붙은 말풍선은 S3-3 S3-4가 더 붙는다(QA F7) */
  ac?: string;
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
        {message.body}
        <span aria-hidden className="text-muted-foreground text-xs">
          {time}
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
        <AutoReplyBubble message={message} clarify={kind === "clarify"} />
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
 * 되묻기의 옵션 칩은 계약에 필드가 없어 그리지 않는다(소매가 고르는 것이라 도매에선 눌리지도 않는다).
 */
function AutoReplyBubble({
  message,
  clarify,
}: {
  message: ChatMessage;
  clarify: boolean;
}) {
  const facts = toFactsView(message.autoReply);
  return (
    <Bubble tone="plain" className="grid gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Chip shape="square" className="h-5 px-2 text-xs">
          {ROOM_TEXT.autoReply}
        </Chip>
        {clarify ? ROOM_TEXT.clarify : null}
      </span>
      <span>{message.body}</span>
      {facts ? (
        <span className="border-border text-secondary-foreground text-body grid gap-0.5 border-t pt-2">
          {facts.lines.map((line) => (
            <span key={factLineText(line)}>
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
          <span data-ac="S7-13" className="text-muted-foreground text-xs">
            {facts.seen}
          </span>
        </span>
      ) : null}
    </Bubble>
  );
}
