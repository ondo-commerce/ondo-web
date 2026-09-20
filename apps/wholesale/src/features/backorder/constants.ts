import type { EtaField } from "./types";

/** 등록되지 않은 예상 입고일의 표시. Figma 좌측 목록 12행이 전부 이 값이다 */
export const EMPTY_MARK = "-";

/** 목록 한 페이지. 스펙: `size > 100`이면 400 `VALIDATION_FAILED` */
export const PAGE_SIZE = 100;

/**
 * 목록 정렬 — 많이 밀린 SKU 먼저(화면 규칙). **명시해서 보낸다** — 스냅샷의 서버 기본은
 * `latestBackorderedAt,desc`라 안 보내면 화면 규칙과 갈린다. 스펙이 아는 키는 이것과
 * `latestBackorderedAt` 둘뿐이라 2차 키(`variantId`)는 못 붙인다(400) — 동률은 `derive.sortSkus`가 가른다(#201)
 */
export const SKU_LIST_SORT = "backorderQty,desc";

/** 예상 입고일 폼의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸 아래 붙는다 */
export const ETA_FIELDS: readonly EtaField[] = [
  "expectedInboundDate",
  "expectedInboundReason",
];

/**
 * 배분 확정이 거절됐을 때 사장에게 보일 문구. 코드로만 가른다 — 서버 `message`는 개발자용이라
 * 바뀔 수 있고, 그 아래 보조로만 쓴다(`derive.allocationErrorText`).
 *
 * 409·404 문구는 "새로 불러왔다"고 말한다 — 뮤테이션 `onError`가 그 자리에서 목록·펼침을
 * 무효화하므로(#198) 문구가 뜰 때는 이미 재조회가 나간 뒤다.
 */
export const BACKORDER_ERROR_TEXT: Readonly<Record<string, string>> = {
  ALLOCATION_EXCEEDS_REMAINING: "배분 수량이 남은 미송 수량을 넘겼어요.",
  ALLOCATION_EXCEEDS_ORDER: "배분 수량이 주문 수량을 넘겼어요.",
  INSUFFICIENT_STOCK: "재고가 모자라요. 가용재고를 다시 확인해 주세요.",
  BACKORDER_NOT_OPEN:
    "이미 해소된 미송이 섞여 있어요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  DUPLICATE_BACKORDER: "같은 미송이 두 번 들어갔어요.",
  INVARIANT_VIOLATED: "수량이 맞지 않아요. 다시 입력해 주세요.",
  RESOURCE_NOT_FOUND: "이미 없어진 미송이에요. 목록을 새로 불러왔어요.",
};
