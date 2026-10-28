import { Chip, cn } from "@ondo/ui";
import type { ReactNode } from "react";
import { ROOM_TEXT } from "../constants";
import {
  bubbleKindOf,
  factLineText,
  formatClock,
  senderLabel,
  toFactsView,
} from "../derive";
import type { ChatMessage } from "../types";

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
 * 말풍선 면. 내 것은 primary(지금은 임시 회색 — memory "primary 회색은 임시다"), 소매는 secondary.
 * `wrap-anywhere`: 공백 없는 1000자도 방 폭을 넘지 않게(S4-4). 줄바꿈은 보낸 그대로.
 */
export function Bubble({
  tone,
  className,
  children,
}: {
  tone: "me" | "them" | "plain";
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
          {facts.seen ? (
            <span className="text-muted-foreground text-xs">{facts.seen}</span>
          ) : null}
        </span>
      ) : null}
    </Bubble>
  );
}
