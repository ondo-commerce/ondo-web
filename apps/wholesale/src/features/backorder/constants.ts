import type { EtaField } from "./types";

/** 등록되지 않은 예상 입고일의 표시. Figma 좌측 목록 12행이 전부 이 값이다 */
export const EMPTY_MARK = "-";

/** 목록 한 페이지. 스펙: `size > 100`이면 400 `VALIDATION_FAILED` */
export const PAGE_SIZE = 100;

/** 예상 입고일 폼의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸 아래 붙는다 */
export const ETA_FIELDS: readonly EtaField[] = [
  "expectedInboundDate",
  "expectedInboundReason",
];

/**
 * 배분 확정이 거절됐을 때 사장에게 보일 문구. 코드로만 가른다 — 서버 `message`는 개발자용이라
 * 바뀔 수 있고, 그 아래 보조로만 쓴다(`derive.allocationErrorText`).
 */
export const BACKORDER_ERROR_TEXT: Readonly<Record<string, string>> = {
  ALLOCATION_EXCEEDS_REMAINING: "배분 수량이 남은 미송 수량을 넘겼어요.",
  ALLOCATION_EXCEEDS_ORDER: "배분 수량이 주문 수량을 넘겼어요.",
  INSUFFICIENT_STOCK: "재고가 모자라요. 가용재고를 다시 확인해 주세요.",
  BACKORDER_NOT_OPEN:
    "이미 해소된 미송이 섞여 있어요. 목록을 다시 불러온 뒤 확인해 주세요.",
  DUPLICATE_BACKORDER: "같은 미송이 두 번 들어갔어요.",
  INVARIANT_VIOLATED: "수량이 맞지 않아요. 다시 입력해 주세요.",
  RESOURCE_NOT_FOUND: "이미 없어진 미송이에요. 목록을 다시 불러와 주세요.",
};
