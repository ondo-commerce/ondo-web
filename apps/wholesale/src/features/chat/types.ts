import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 채팅 op 5개는 초안(#263, `x-ondo-draft`)이지만
 * 타입은 스냅샷에서 난다. BE가 구현해 sync-spec이 덮어쓰면 여기가 아니라 `codegen`이 알려준다.
 * ------------------------------------------------------------------------ */

export type ChatRoomSummary = WholesaleSchema<"ChatRoomSummary">;
export type ChatRoomDetail = WholesaleSchema<"ChatRoomDetail">;
export type ChatMessage = WholesaleSchema<"ChatMessage">;
export type ChatMessagePageMeta = WholesaleSchema<"ChatMessagePageMeta">;
export type ChatReadResult = WholesaleSchema<"ChatReadResult">;
export type CursorPageMeta = WholesaleSchema<"CursorPageMeta">;
export type ChatAutoReply = WholesaleSchema<"ChatAutoReply">;
export type StockBand = WholesaleSchema<"StockBand">;
/** 넘김 줄의 이유(초안 칸 `handoff`, #301). 값이 늘 수 있다 — 모르는 값은 이유 줄 없이 그린다 */
export type ChatHandoff = WholesaleSchema<"ChatHandoff">;
export type ChatHandoffReason = WholesaleSchema<"ChatHandoffReason">;
/** 자동 답 설정(초안 op `autoReplySettings`, #266). 도매처 하나에 한 벌 */
export type AutoReplySettings = WholesaleSchema<"AutoReplySettings">;

/** `GET /rooms` 한 페이지. 봉투가 `PageMeta`가 아니라 커서(`nextCursor`)라 `apiFetchBody`로 통째로 받는다 */
export interface ChatRoomPage {
  data: ChatRoomSummary[];
  meta: CursorPageMeta;
}

/** `GET /rooms/{id}/messages` 한 번의 응답. `meta.hasMore`가 "바로 이어 받을지"를 말한다 */
export interface ChatMessagePage {
  data: ChatMessage[];
  meta: ChatMessagePageMeta;
}

/* ------------------------------------------------------------------------
 * 방 하나의 메시지 캐시. polling이 이 모양을 계속 갱신한다.
 * ------------------------------------------------------------------------ */

/**
 * 열린 방의 메시지 상태. queryKey 하나에 이 객체가 산다.
 *
 * `cursor`와 `messages`의 최대 sequence를 따로 두는 이유: 보낸 메시지(#265)는 응답을 받는 즉시
 * `messages`에 넣지만 **cursor는 올리지 않는다.** 내가 보낸 7번 앞에 소매처의 6번이 같이 커밋됐을 수
 * 있는데, cursor를 7로 올리면 다음 polling이 `afterSequence=7`을 물어 6번을 영영 못 받는다.
 * cursor는 GET으로 **빠짐없이 이어 받은** 마지막 sequence다.
 */
export interface ChatThread {
  /** sequence 오름차순, sequence 중복 없음 */
  messages: ChatMessage[];
  /** 다음 polling의 `afterSequence`. 빈 방이면 0 */
  cursor: number;
  /** 연속 polling 실패 수. 성공하면 0 */
  failures: number;
  /** 다음 polling까지 기다릴 시간. 실패할 때 한 번 뽑아 둔다 — 렌더마다 다시 뽑으면 타이머가 매번 다시 걸린다 */
  nextPollMs: number;
}

/** 읽음 요청 응답으로 알게 된 방별 읽음 위치. 늦게 온 목록 응답보다 이쪽이 이긴다 */
export type ReadMarks = Readonly<Record<number, ChatReadResult>>;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`로만 만든다.
 * ------------------------------------------------------------------------ */

/** 목록 한 행 */
export interface ChatRoomRowView {
  roomId: number;
  name: string;
  /** 서버가 80자로 자른 미리보기. 메시지가 없으면 빈 글자 */
  preview: string;
  /** `09:30` / `10/27` / `25.12.30` */
  time: string;
  /** 0이면 null — 배지를 그리지 않는다. 100 이상은 `99+` */
  unreadLabel: string | null;
  unreadCount: number;
  needsReply: boolean;
}

/**
 * 말풍선 모양. 서버 `kind`가 늘어날 수 있어(가이드 §9) 모르는 값은 `sender`만 보고 좌우를 가른다.
 * - `them` 소매 TEXT(왼쪽) / `me` 내 TEXT(오른쪽)
 * - `auto` 자동 답변(AUTO_REPLY) / `clarify` 되묻기(CLARIFY) — 둘 다 내 쪽, 흰 면
 * - `system` 사람 넘김(HANDOFF)과 SYSTEM이 보낸 모르는 kind — 가운데 줄
 */
export type BubbleKind = "them" | "me" | "auto" | "clarify" | "system";

/** 날짜 구분선 또는 메시지 한 줄. 렌더 순서 그대로 */
export type ThreadItem =
  | { type: "divider"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage };

export type ChatSendResult = WholesaleSchema<"ChatSendResult">;

/**
 * 왜 못 보냈나. 화면이 다르게 반응해야 하는 셋뿐이다.
 * - `server` 500 등 — `다시 보내기`(같은 키) `지우기`
 * - `offline` 보낼 때 오프라인이었거나 서버까지 못 갔다 — 같은 버튼, 문구만 다르다. 자동 재전송은 없다
 * - `session` 401 — `지우기`만. 다시 보내도 401이다
 */
export type SendFailure = "server" | "offline" | "session";

/**
 * 아직 서버 sequence가 없는 내 말풍선. 방 아래에 붙어 있다가(디자인 결정 14) 서버 메시지 중
 * 같은 `clientMessageId`가 나타나면 그쪽으로 합쳐진다(S4-6).
 */
export interface PendingMessage {
  /** 말풍선 하나에 uuid 하나. 그대로 `Idempotency-Key`다 — 다시 보내도 같은 키 */
  clientMessageId: string;
  body: string;
  status: "sending" | "failed";
  failure: SendFailure | null;
}

/** 입력창 글자 수 판정(S4-4) */
export interface ComposerCheck {
  /** 앞뒤 공백을 뺀 코드 포인트 수 */
  length: number;
  /** 공백만 — 보내기 잠김, 문구 없음 */
  blank: boolean;
  /** 상한 초과 — 보내기 잠김, 자르지 않고 안내 */
  over: boolean;
  /** `950/1,000`. 900자 전엔 null */
  counter: string | null;
  /** `1,000자까지 보낼 수 있어요 (1,001/1,000)`. 넘지 않으면 null */
  overMessage: string | null;
}

/**
 * 되묻기 보기 줄(#296 S13-1, #299 S4-1).
 * - `inline` 재고 보기(VARIANT만) — `보기: A, B, C` 한 줄(디자인 결정 37)
 * - `list` 미송 보기가 섞이면 — "보기" 이름표 한 번 + 보기마다 한 줄(디자인 결정 38). 미송 보기 글자 안에
 *   쉼표("…레드/L, 남은 4장, 9/4 주문 #7001")가 있어 쉼표로 이으면 보기 경계가 안 보인다
 */
export type ClarifyChoicesView =
  { mode: "inline"; text: string } | { mode: "list"; items: string[] };

/** 자동 답변 아래 근거 칸. 도매에만 정확 수량이 온다 */
export interface FactPart {
  text: string;
  /** 값 조각(수량, 금액, 날짜). 굵게 + foreground */
  strong: boolean;
}

/** 근거 한 줄 — `판매가능 ` + **35장** + `, 주문 한도 ` + **500장** */
export type FactLine = FactPart[];

export interface FactsView {
  /** 값 줄. 되묻기처럼 값이 없는 자동 답은 빈 배열 — 그래도 조회 시각 줄은 있다 */
  lines: FactLine[];
  /**
   * 근거 칸 끝 줄. 모든 자동 답에 "HH:mm 조회"(F12, S7-13). 재고 답만 앞에 "소매처에게는 …으로 보였어요."
   */
  seen: string;
  /** `lines`와 같은 순서의 `data-ac`. 미결제 줄만 "S3-3"(QA F1), 나머지 null */
  lineAc: (string | null)[];
  /** 끝 줄 `data-ac`. "S7-13 S3-5", 미수 답이면 "S7-13 S3-5 S3-3"(와이어프레임 17 `.seen`, QA F1) */
  seenAc: string;
}

/**
 * 목록 머리 아래 한 줄(디자인 결정 24, 25).
 * - `off` 꺼짐 안내(Notice, role=status)
 * - `failed` 바꾸기 실패(role=alert). 다음 누름에서 사라진다
 */
export type AutoReplyNote = "off" | "failed" | null;
