/**
 * 주문 화면들의 더미. **API가 붙으면 이 파일만 지운다.**
 *
 * 값은 확정 와이어프레임 `15_retail-hallmark/parts/06~09 · 18~20` 그대로 옮기되
 * **계산이 안 맞는 값은 고쳐서** 넣는다(`01-pm.md` §7 가정 A5). 원본을 그대로
 * 베끼면 화면 두 곳이 서로 다른 금액을 말하게 되고, 그건 QA가 결함으로 잡는다.
 */

import type { OrderRecord } from "./types";

/** 도매처별 입금 계좌 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  holder: string;
}

/**
 * 계좌 이체를 고른 도매처에만 붙는 안내.
 *
 * **전부 더미다.** 계좌는 도매가 등록하는 값인데 도매에 그 화면이 아직 없고,
 * 원본 어디에도 실제 계좌가 없다(§5-9). 예금주는 도매처명으로 둔다 —
 * 실제로는 대표자명일 수 있지만, 없는 이름을 지어내는 것보다 정직하다.
 */
const DEFAULT_BANK: BankAccount = {
  bankName: "국민",
  accountNo: "000000-00-000000",
  holder: "",
};

/**
 * 도매처 하나의 입금 계좌. 등록된 계좌가 없어도 화면이 비지 않게 기본 더미를
 * 돌려주고, 예금주만 그 도매처 이름으로 채운다.
 */
export function bankAccountOf(wholesalerName: string): BankAccount {
  return { ...DEFAULT_BANK, holder: wholesalerName };
}

/* ────────────────────────────────────────────────────────────────────────
   지난 주문 — 목록 5행과 상세 5장이 **같은 이 배열**을 읽는다.

   원본의 숫자 결함 셋을 고쳐서 넣었다(`01-pm.md` 가정 A5).
   - 상세 합계 517,000원 ≠ 행 합 618,000원 → **618,000원**(행에서 파생)
   - 목록 2행 금액도 같은 주문이므로 **618,000원**
   - 데님하우스 주소가 라인 표와 결제 패널에서 달랐다 → `디오트 지하 1층 12호`
     하나로. 사입삼촌에게 넘길 주소라 화면마다 다르면 안 된다
   맞는 것은 안 고쳤다: 미수 270,000 = 90,000 + 180,000 ✓ / 출고 3건 중 2건 ✓ /
   라인 5개 ✓ / 총 62장 ✓.
   ──────────────────────────────────────────────────────────────────────── */

/** 도매처 연락처·영업시간. 상세의 `결제 · 수령` 패널이 읽는다 */
const HOURS = "영업 20:00~06:00";
const PHONE = "02-000-0000";

export const ORDERS: readonly OrderRecord[] = [
  {
    /* 1행은 **방금 넣은 주문**이다 — 장바구니 4줄과 46장·428,000원이 정확히
       일치한다. 우연이 아니라 확정 와이어프레임이 그렇게 그려 뒀다 */
    orderId: "20260831-1420-0102",
    orderedAt: "2026.08.31 14:20",
    legs: [
      {
        wholesalerId: "w-moodon",
        wholesalerName: "무드온",
        wholesalerLocation: "청평화패션몰 2층 24호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608310021",
        canceled: false,
        confirmed: false,
        received: false,
        pickup: null,
        payment: null,
      },
      {
        wholesalerId: "w-cotton",
        wholesalerName: "코튼클럽",
        wholesalerLocation: "디오트 3층 51호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608310022",
        canceled: false,
        confirmed: false,
        received: false,
        pickup: null,
        payment: null,
      },
    ],
    lines: [
      {
        lineId: "o1-l1",
        wholesalerId: "w-moodon",
        productId: "p-flower-shirt",
        productName: "빈티지 플라워 셔츠",
        productCode: "SU-18",
        colorLabel: "체리레드",
        size: "S",
        qty: 10,
        price: 12500,
        status: "PENDING",
      },
      {
        lineId: "o1-l2",
        wholesalerId: "w-moodon",
        productId: "p-flower-shirt",
        productName: "빈티지 플라워 셔츠",
        productCode: "SU-18",
        colorLabel: "체리레드",
        size: "M",
        qty: 6,
        price: 13000,
        status: "PENDING",
      },
      {
        lineId: "o1-l3",
        wholesalerId: "w-moodon",
        productId: "p-flower-shirt",
        productName: "빈티지 플라워 셔츠",
        productCode: "SU-18",
        colorLabel: "딥네이비",
        size: "L",
        qty: 10,
        price: 13500,
        status: "PENDING",
        soldOut: true,
      },
      {
        lineId: "o1-l4",
        wholesalerId: "w-cotton",
        productId: "p-cotton-tee",
        productName: "데일리 코튼 티셔츠",
        productCode: "SU-03",
        colorLabel: "화이트",
        size: "M",
        qty: 20,
        price: 4500,
        status: "PENDING",
      },
    ],
    shipments: [],
  },

  {
    /* 상세 화면의 원본이 된 주문. 도매처 3곳 중 라비앙만 아직 확정 전이라
       `결제 · 수령` 패널에서 조용히 빠지지 않고 "확정하면 표시돼요"로 선다 */
    orderId: "20260824-1010-0098",
    orderedAt: "2026.08.24 10:10",
    legs: [
      {
        wholesalerId: "w-cotton",
        wholesalerName: "코튼클럽",
        wholesalerLocation: "디오트 3층 51호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608240022",
        canceled: false,
        confirmed: true,
        received: true,
        pickup: "AGENT",
        payment: "CASH",
      },
      {
        wholesalerId: "w-denim",
        wholesalerName: "데님하우스",
        /* 가정 A5-e: 원본이 라인 표에서는 `데님하우스 지하 1층 12호`,
           결제 패널에서는 `디오트 지하 1층 12호`로 갈려 있었다. 상가명이
           있는 쪽이 맞다 */
        wholesalerLocation: "디오트 지하 1층 12호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608240023",
        canceled: false,
        confirmed: true,
        /* 장끼는 나갔는데 아직 안 가져갔다 — 그래서 라인이 `수령 가능`이다
           (§3-0 C: 소매 `수령 가능` = 도매 `출고 대기`) */
        received: false,
        pickup: "DIRECT",
        payment: "TRANSFER",
      },
      {
        wholesalerId: "w-lavien",
        wholesalerName: "라비앙",
        wholesalerLocation: "청평화패션몰 3층 8호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608240024",
        canceled: false,
        confirmed: false,
        received: false,
        pickup: null,
        payment: null,
      },
    ],
    lines: [
      {
        lineId: "o2-l1",
        wholesalerId: "w-cotton",
        productId: "p-cotton-tee",
        productName: "데일리 코튼 티셔츠",
        productCode: "SU-03",
        colorLabel: "화이트",
        size: "M",
        qty: 20,
        price: 4500,
        status: "SHIPPED",
        reorder: "ADDED",
      },
      {
        lineId: "o2-l2",
        wholesalerId: "w-cotton",
        productId: "p-cotton-tee",
        productName: "데일리 코튼 티셔츠",
        productCode: "SU-03",
        colorLabel: "블랙",
        size: "L",
        qty: 15,
        price: 4500,
        status: "BACKORDER",
        reorder: "DELISTED",
      },
      {
        lineId: "o2-l3",
        wholesalerId: "w-denim",
        productId: "p-highwaist-denim",
        productName: "하이웨스트 데님 팬츠",
        productCode: "SU-15",
        colorLabel: "인디고",
        size: "M",
        qty: 10,
        price: 18000,
        status: "READY",
        reorder: "PRICE_UP",
        currentPrice: 19000,
      },
      {
        lineId: "o2-l4",
        wholesalerId: "w-lavien",
        productId: "p-shirring-dress",
        productName: "셔링 미니 원피스",
        productCode: "SU-42",
        colorLabel: "아이보리",
        size: "Free",
        qty: 12,
        price: 16500,
        status: "PENDING",
        reorder: "SEASON_ENDED",
      },
      {
        lineId: "o2-l5",
        wholesalerId: "w-lavien",
        productId: "p-shirring-dress",
        productName: "셔링 미니 원피스",
        productCode: "SU-42",
        colorLabel: "블랙",
        size: "Free",
        qty: 5,
        price: 16500,
        status: "PENDING",
        reorder: "DELISTED",
      },
    ],
    shipments: [
      {
        statementNo: "JG-20260826-002",
        wholesalerId: "w-cotton",
        shippedAt: "2026.08.26 21:40",
        lines: [
          {
            productName: "데일리 코튼 티셔츠",
            colorLabel: "화이트",
            size: "M",
            qty: 20,
            price: 4500,
          },
        ],
      },
      {
        statementNo: "JG-20260828-005",
        wholesalerId: "w-denim",
        shippedAt: "2026.08.28 22:05",
        lines: [
          {
            productName: "하이웨스트 데님 팬츠",
            colorLabel: "인디고",
            size: "M",
            qty: 10,
            price: 18000,
          },
        ],
      },
    ],
  },

  {
    orderId: "20260816-1731-0091",
    orderedAt: "2026.08.16 17:31",
    legs: [
      {
        wholesalerId: "w-lavien",
        wholesalerName: "라비앙",
        wholesalerLocation: "청평화패션몰 3층 8호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608160019",
        canceled: false,
        confirmed: true,
        received: true,
        pickup: "DIRECT",
        payment: "CASH",
      },
    ],
    lines: [
      {
        lineId: "o3-l1",
        wholesalerId: "w-lavien",
        productId: "p-shirring-dress",
        productName: "셔링 미니 원피스",
        productCode: "SU-42",
        colorLabel: "크림",
        size: "Free",
        qty: 28,
        price: 8250,
        status: "SHIPPED",
        reorder: "SEASON_ENDED",
      },
    ],
    shipments: [
      {
        statementNo: "JG-20260817-004",
        wholesalerId: "w-lavien",
        shippedAt: "2026.08.17 20:10",
        lines: [
          {
            productName: "셔링 미니 원피스",
            colorLabel: "크림",
            size: "Free",
            qty: 28,
            price: 8250,
          },
        ],
      },
    ],
  },

  {
    orderId: "20260809-0942-0084",
    orderedAt: "2026.08.09 09:42",
    legs: [
      {
        wholesalerId: "w-denim",
        wholesalerName: "데님하우스",
        wholesalerLocation: "디오트 지하 1층 12호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2608090014",
        canceled: false,
        confirmed: true,
        received: false,
        pickup: "DIRECT",
        payment: "TRANSFER",
      },
    ],
    lines: [
      {
        lineId: "o4-l1",
        wholesalerId: "w-denim",
        productId: "p-highwaist-denim",
        productName: "하이웨스트 데님 팬츠",
        productCode: "SU-15",
        colorLabel: "진청",
        size: "L",
        qty: 18,
        price: 18000,
        status: "READY",
        reorder: "PRICE_UP",
        currentPrice: 19000,
      },
    ],
    shipments: [
      {
        statementNo: "JG-20260810-001",
        wholesalerId: "w-denim",
        shippedAt: "2026.08.10 21:15",
        lines: [
          {
            productName: "하이웨스트 데님 팬츠",
            colorLabel: "진청",
            size: "L",
            qty: 18,
            price: 18000,
          },
        ],
      },
    ],
  },

  {
    orderId: "20260728-1602-0072",
    orderedAt: "2026.07.28 16:02",
    legs: [
      {
        wholesalerId: "w-moodon",
        wholesalerName: "무드온",
        wholesalerLocation: "청평화패션몰 2층 24호",
        phone: PHONE,
        businessHours: HOURS,
        orderNo: "ORD-2607280009",
        canceled: true,
        confirmed: false,
        received: false,
        pickup: null,
        payment: null,
      },
    ],
    lines: [
      {
        lineId: "o5-l1",
        wholesalerId: "w-moodon",
        productId: "p-basic-tee",
        productName: "기본 반팔 티셔츠",
        productCode: "SU-53",
        colorLabel: "화이트",
        size: "M",
        qty: 12,
        price: 8000,
        /* 취소된 주문의 라인이 `확정 대기`로 남으면 머리 배지와 반대되는 말을
           한다 — 와이어프레임에 없는 다섯 번째 라인 상태를 둔 이유다 */
        status: "CANCELED",
        reorder: "ADDED",
      },
    ],
    shipments: [],
  },
];

/** 통합 주문번호로 하나 찾기. 없으면 상세가 `찾을 수 없어요`를 띄운다 */
export function findOrder(orderId: string): OrderRecord | undefined {
  return ORDERS.find((order) => order.orderId === orderId);
}

/**
 * 지난 주문의 장끼에 적힌 수령인.
 *
 * **더미다.** 수령인은 주문할 때 입력한 사입삼촌 정보가 도매처 확정 시점에
 * 문서로 굳는 값인데, 지난 주문에는 그 입력이 남아 있지 않다(서버가 없다).
 * 이번에 접수하는 주문의 수령인은 주문서에 친 값을 그대로 쓴다 —
 * 지어낸 이름이 뜨는 자리는 여기 하나뿐이고, API가 붙으면 같이 사라진다.
 */
export const PAST_RECEIVER_NAME = "박삼촌";
