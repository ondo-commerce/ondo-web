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
  /** `product` → `‹ 상품으로 돌아가기`, `wholesaler` → `도매처 홈 ›` */
  kind: "product" | "wholesaler";
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

/** 되묻기(CLARIFY) 말풍선 안 옵션 칩 줄 */
export interface ClarifyView {
  /** 이 되묻기가 물은 게시글. 칩을 고를 때 `inquiry.listingId`로 간다 */
  listingId: number;
  choices: ChatChoice[];
  /** 지금 고를 수 있나(`choicesActive`). 아니면 줄 전체 disabled */
  active: boolean;
  /** 이 되묻기에 대해 이미 고른 옵션(보낸 것, 보내는 중, 못 보낸 것 포함). 없으면 null */
  selectedVariantId: number | null;
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
