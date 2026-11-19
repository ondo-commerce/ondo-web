import type { InquiryListing } from "./inquiry";

/**
 * 채팅 목 전용 게시글 2개. 상품 목 시드(V900)에는 **없는 경계**를 자동 답이 시험하려고 지었다
 * (loop-05b §5-4 "골든셋 전용 상품"). 상품 화면에는 나오지 않는다 — 채팅 판정만 읽는다.
 *
 * - 2901: 게시 옵션 1개(3901). 되묻지 않고 바로 답한다. 3902는 게시 안 된 옵션(칩으로 지정하면 넘김)
 * - 2902: 게시 옵션 0개. 재고를 물으면 넘긴다
 *
 * 쓰는 길: `POST /__mock/chat/rooms/{roomId}/context {listingId: 2901}` 뒤 재고 문장을 보낸다.
 * 골든셋 `stock` 표의 `source: "chat mock extra"` 행이 이 값과 같아야 한다(`inquiry.test.ts`가 본다).
 */
export const CHAT_EXTRA_LISTINGS: readonly InquiryListing[] = [
  {
    listingId: 2901,
    wholesalerId: 101,
    title: "무지 캔버스 에코백",
    published: true,
    variants: [
      {
        variantId: 3901,
        color: "블랙",
        size: "FREE",
        availableQty: 50,
        orderLimit: 0,
        published: true,
      },
      {
        variantId: 3902,
        color: "화이트",
        size: "FREE",
        availableQty: 5,
        orderLimit: 0,
        published: false,
      },
    ],
  },
  {
    listingId: 2902,
    wholesalerId: 101,
    title: "샘플 반팔 티셔츠",
    published: true,
    variants: [
      {
        variantId: 3903,
        color: "그레이",
        size: "M",
        availableQty: 10,
        orderLimit: 0,
        published: false,
      },
    ],
  },
];
