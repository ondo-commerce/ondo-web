import type { RetailSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 소매 스펙에서 생성한 타입의 별칭(ADR-0002). 채팅 op 6개는 초안(#263, `x-ondo-draft`)이다.
 * 도매 `features/chat/types.ts`와 이름이 같지만 **다른 타입이다** — 소매 응답의 `autoReply.facts`는
 * `ChatRetailFacts`라 정확 수량 필드가 없다(D31②). 앱 사이 import도 금지다.
 * ------------------------------------------------------------------------ */

export type ChatRoomDetail = RetailSchema<"ChatRoomDetail">;
export type ChatMessage = RetailSchema<"ChatMessage">;
export type ChatMessagePageMeta = RetailSchema<"ChatMessagePageMeta">;
export type ChatSendResult = RetailSchema<"ChatSendResult">;
export type CreateChatRoomRequest = RetailSchema<"CreateChatRoomRequest">;
/** 칩으로 고른 문의 문맥. 자유 문장이면 null(loop-05b §4-1 2) */
export type ChatInquiry = RetailSchema<"ChatInquiry">;
/** 되묻기 보기 하나. `choices`는 초안 칸이라 생성 타입에서 `?: … | null`이다(02-dev §4 판단 1) */
export type ChatChoice = RetailSchema<"ChatChoice">;
export type StockBand = RetailSchema<"StockBand">;
/** 목록 행 하나(`GET /rooms`). 06a부터 소매 화면이 부른다 */
export type ChatRoomSummary = RetailSchema<"ChatRoomSummary">;
export type CursorPageMeta = RetailSchema<"CursorPageMeta">;
/** 읽음 응답. 서버가 `max(기존, 요청)`으로 저장해 돌려준 위치와 남은 수 */
export type ChatReadResult = RetailSchema<"ChatReadResult">;
/** 헤더 배지 둘(초안 op `notificationUnreadCount`, #298). 06a 화면은 `chats`만 그린다 */
export type RetailUnreadCount = RetailSchema<"RetailUnreadCount">;

/** `GET /rooms` 한 장. 커서 봉투라 `apiFetchBody`로 통째로 받는다 */
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
 * 방 하나의 메시지 캐시. polling이 이 모양을 계속 갱신한다(도매와 같은 모양).
 * ------------------------------------------------------------------------ */

/**
 * 열린 방의 메시지 상태. queryKey 하나에 이 객체가 산다.
 *
 * `cursor`를 messages의 최대 sequence와 따로 두는 이유(도매와 같다): 보낸 메시지는 응답을 받는 즉시
 * `messages`에 넣지만 cursor는 올리지 않는다. 내가 보낸 7번 앞에 도매의 6번이 같이 커밋됐을 수 있는데,
 * cursor를 7로 올리면 다음 polling이 `afterSequence=7`을 물어 6번을 영영 못 받는다.
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
  /**
   * 상대(도매)가 읽은 위치, 방별 최댓값 하나(loop-08 S4, 기획 §4-3 1). messages meta(빈 응답에도 온다)와
   * 방 머리 `counterpartLastReadSequence`를 둘 다 여기로 합친다 — 늦게 온 쪽이 작은 값을 들고 와도 안 내려간다.
   * 아직 안 읽었으면 null. 도매 `ChatThread.counterpartRead`와 같은 규칙(앱 사이 import 금지라 따로 둔다)
   */
  counterpartRead: number | null;
}

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`로만 만든다.
 * ------------------------------------------------------------------------ */

/**
 * 말풍선 모양. **소매 화면은 도매와 좌우가 반대다**(01-plan §4-5).
 * - `me` 내(RETAILER) 글, 오른쪽
 * - `them` 도매 TEXT와 모르는 kind, 왼쪽
 * - `auto` 자동 답변(AUTO_REPLY, CLARIFY) — 도매 이름으로 나간 답이라 **상대 쪽(왼쪽)**, 흰 면
 * - `system` 사람 넘김(HANDOFF)과 SYSTEM의 모르는 kind — 가운데 줄
 */
export type BubbleKind = "me" | "them" | "auto" | "system";

/** 날짜 구분선 또는 메시지 한 줄. 렌더 순서 그대로 */
export type ThreadItem =
  | { type: "divider"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage };

/** 방 머리의 돌아가기 링크. 하나뿐이다(디자인 결정 14) */
export interface ReturnLink {
  href: string;
  /** `product` → `‹ 상품으로 돌아가기`, `wholesaler` → `도매처 홈 ›`, `chats` → `‹ 채팅 목록` */
  kind: "product" | "wholesaler" | "chats";
}

/* ------------------------------------------------------------------------
 * 헤더 count와 목록(loop-06 S2)
 * ------------------------------------------------------------------------ */

/** 헤더 count 쿼리의 값. 06b 알림 종과 같이 써서 `shared/headerCounts.ts`로 내렸다 */
export type { HeaderCounts } from "@/shared/headerCounts";

/** 헤더 아이콘 하나의 그리기 값. 배지 글자와 접근 이름이 같은 숫자에서 나온다 */
export interface BadgeView {
  /** 접근 이름("채팅, 안 읽은 메시지 3개"). 숫자는 여기에만 한 번 */
  label: string;
  /** 배지 글자("3", "99+"). 없으면 배지를 안 그린다 */
  badge: string | null;
}

/** `/chats` 행 하나 */
export interface ChatRoomRowView {
  roomId: number;
  href: string;
  name: string;
  preview: string;
  /** `14:18`, `어제`, `10/25` */
  time: string;
  /** 알약 글자. 0이면 null */
  unreadLabel: string | null;
  unreadCount: number;
}

/** 읽음을 지금 보낼지 정하는 입력(`nextReadTarget`) */
export interface ReadState {
  /** 화면에 그린 가장 큰 sequence */
  drawn: number;
  /** 서버가 확인해 준 위치 */
  confirmed: number;
  /** 응답을 기다리는 위치. 없으면 0 */
  inFlight: number;
  visible: boolean;
  sessionLost: boolean;
}

/**
 * 왜 못 보냈나. 화면이 다르게 반응해야 하는 셋뿐이다(도매와 같다).
 * - `server` 500 등 — `다시 보내기`(같은 키) `지우기`
 * - `offline` 보낼 때 오프라인이었거나 서버까지 못 갔다 — 같은 버튼, 문구만 다르다. 자동 재전송은 없다
 * - `session` 401 — `지우기`만. 다시 보내도 401이다
 */
export type SendFailure = "server" | "offline" | "session";

/**
 * 아직 서버 sequence가 없는 내 말풍선. 방 아래에 붙어 있다가 서버 메시지 중 같은 `clientMessageId`가
 * 나타나면 그쪽으로 합쳐진다(응답 유실, S6-4).
 */
export interface PendingMessage {
  /** 말풍선 하나에 uuid 하나. 그대로 `Idempotency-Key`다 — 다시 보내도 같은 키 */
  clientMessageId: string;
  body: string;
  /**
   * 보낼 때 같이 간 문의 문맥(loop-05b §4-1 3). 다시 보내기가 같은 `{body, inquiry}`를 같은 키로 보내려면
   * 말풍선이 들고 있어야 한다 — 훅이 다시 만들면 칩으로 고른 옵션이 자유 문장으로 바뀐다(S8-15)
   */
  inquiry: ChatInquiry | null;
  status: "sending" | "failed";
  failure: SendFailure | null;
}

/** 입력창 글자 수 판정(S6-3) */
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

/* ------------------------------------------------------------------------
 * 재고 자동 답(loop-05b S8) — 되묻기 칩, 재고 카드, 장바구니 담기
 * ------------------------------------------------------------------------ */

/**
 * 되묻기(CLARIFY) 말풍선 안 보기 줄.
 * - `stock` 재고 되묻기 — 옵션 알약 칩 줄(05b 결정 22)
 * - `backorder` 미송 되묻기 — 주문 네모 버튼 세로 목록 + 끝에 `다른 주문이에요` 알약(loop-06 결정 37 38)
 */
export interface ClarifyView {
  mode: "stock" | "backorder";
  /** 이 되묻기가 물은 게시글. 재고 칩을 고를 때 `inquiry.listingId`로 간다. 미송 되묻기는 null */
  listingId: number | null;
  choices: ChatChoice[];
  /** 지금 고를 수 있나(`choicesActive`). 아니면 줄 전체 disabled */
  active: boolean;
  /** 이미 고른 보기의 `choiceKey`(보낸 것, 보내는 중, 재고는 못 보낸 것도). 없으면 null */
  selectedKey: string | null;
}

/** 미송 자동 답(AUTO_REPLY, BACKORDER)의 카드 칸(loop-06 S3-3). 담기 없음 */
export interface BackorderCardView {
  backorderId: number;
  /** `린넨 셋업 자켓 베이지 / L` */
  target: string;
  /** `9/7 주문 #7003`. 되묻기 보기에서 못 찾으면 null */
  order: string | null;
  /** `2장` — 남은 미배분 수량 */
  qtyLabel: string;
  /** 예정, 오늘, 미정, 등록 예정일 지남 */
  state: "FUTURE" | "TODAY" | "NONE" | "PAST";
  /** `11월 5일`, 다른 해 `2027년 1월 5일`. 미정이면 null */
  dateLabel: string | null;
  /** 예정, 오늘일 때만. 그 밖이면 null(결정 40) */
  reason: string | null;
}

/** 카드 한 줄의 조각. `strong`만 굵게(금액, 건수) */
export interface TextPart {
  text: string;
  strong: boolean;
}

/** 미수 자동 답(AUTO_REPLY, RECEIVABLE)의 카드 칸(loop-07 S2). 담기 없음, 경고 색 없음 */
export interface ReceivableCardView {
  /** 줄 목록. 갚을 돈 / 기한(갚을 돈 > 0일 때만) / 선수금(> 0일 때만) */
  lines: TextPart[][];
  /** `/settlements?wholesaler=101` */
  settlementHref: string;
}

/** 재고 자동 답(AUTO_REPLY, STOCK)의 카드 칸. 소매엔 정확 수량이 없다(D31②) */
export interface StockCardView {
  variantId: number;
  /** `레드 / M` */
  optionName: string;
  band: StockBand;
  /** `10~49장`, 재고 없음이면 `재고 없음`(디자인 결정 20) */
  bandLabel: string;
  orderable: boolean;
  /** 1회 한도. 한도 없음이면 null — 카드 한 줄에서 한도 조각을 뺀다 */
  orderLimit: number | null;
  /** 수량 칸과 담기를 켤 수 있나. 재고 없음이거나 주문 불가면 false — 버튼은 disabled로 남는다(결정 27) */
  addable: boolean;
}

/** 카드 수량 칸 판정(`checkCardQty`). `reason`이 있으면 담기 잠김 + 그 한 줄 */
export interface CardQtyCheck {
  /** 보낼 수량. 못 받는 값이면 null */
  qty: number | null;
  reason: string | null;
}

/**
 * 장바구니 담기 한 번. `features/cart`를 모르는 이 feature에 조립부(`app/(shop)/chats/[roomId]`)가 끼워 준다.
 * 돌려받는 `qty`는 더해진 뒤의 장수 — 같은 SKU를 다시 담으면 "지금 2장"이 된다
 */
export type AddToCart = (input: {
  variantId: number;
  qty: number;
}) => Promise<{ qty: number }>;

/** 담기 결과 한 줄. 결정 25 */
export type CardNote =
  { type: "added"; qty: number } | { type: "failed"; message: string };
