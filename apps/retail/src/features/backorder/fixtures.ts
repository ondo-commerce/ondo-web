import type { BackorderLine } from "./types";

/**
 * 미송 더미. 값은 확정 와이어프레임(`15_retail-hallmark/parts/10_backorder.html`) 그대로다.
 * API가 붙으면 이 파일만 지운다.
 */

/**
 * 이 화면이 쓰는 **오늘**. `new Date()`를 부르지 않는다.
 *
 * 이유가 둘이다.
 * ① 서버가 그린 HTML과 브라우저가 그린 결과가 갈리면 `지연` 배지가 깜빡이며 바뀐다
 *    (retail-shell F4와 같은 뿌리).
 * ② 며칠 지나면 화면이 저절로 달라져서 `지연 1건`을 아무도 재현하지 못한다 —
 *    화면이 비는 이유가 코드가 아니라 달력에 있게 된다(`features/catalog`의 `newArrivals`와 같은 규약).
 *
 * 값은 와이어프레임이 08.16=지연 / 09.03=확정으로 그린 순간의 날짜다.
 */
export const BACKORDER_TODAY = "2026-09-01";

/**
 * 미송 3건 · 총 41장.
 *
 * 사양 §2의 교차 검산(거래처 관리 라비앙 16 / 코튼클럽 15 / 데님하우스 10 ↔ 미송 3건 41장)과
 * 같은 값이다. ⚠️ `features/catalog/fixtures.ts`의 `stats.backorderCount`(0/0/1)와는 아직
 * 어긋나 있는데, 그건 도매처 홈 통계용 더미이고 **미송 쪽이 원본**이다. 다른 feature의 더미를
 * 이 회차에서 고치지 않는다 — `/wholesalers` 회차가 이 값으로 맞춘다.
 *
 * 주문일이 셋 다 달라서 **3행 = 3주문**이다. 주문번호 형식은 `parts/09_order_detail.html`의
 * `20260824-1010-0098` 실물을 따랐다.
 */
export const BACKORDER_LINES: readonly BackorderLine[] = [
  {
    id: "bo-001",
    productName: "셔링 미니 원피스",
    wholesalerId: "w-lavien",
    wholesalerName: "라비앙",
    colorName: "아이보리",
    sizeName: "Free",
    qty: 16,
    orderedAt: "2026-08-16",
    /* 도매처가 한 번 날짜를 줬는데 그 날이 지났다 → `지연`. 화면은 이 날짜를 쓰지 않지만
       (§5-2 — 원래 예상일·변동 사유를 적을 자리가 소매 화면에 없다) 판정이 여기서 나온다 */
    etaDate: "2026-08-28",
    orderNo: "20260816-2140-0091",
  },
  {
    id: "bo-002",
    productName: "데일리 코튼 티셔츠",
    wholesalerId: "w-cotton",
    wholesalerName: "코튼클럽",
    colorName: "블랙",
    sizeName: "L",
    qty: 15,
    orderedAt: "2026-08-24",
    etaDate: "2026-09-03",
    orderNo: "20260824-1010-0098",
  },
  {
    id: "bo-003",
    productName: "하이웨스트 데님 팬츠",
    wholesalerId: "w-denim",
    wholesalerName: "데님하우스",
    colorName: "인디고",
    sizeName: "L",
    qty: 10,
    orderedAt: "2026-08-28",
    /* 아직 날짜를 못 받았다 → `확인 중`. 0이나 오늘 날짜로 채우면 없는 약속이 생긴다 */
    etaDate: null,
    orderNo: "20260828-2205-0103",
  },
];
