import type { LedgerEntry, TradePartner } from "./types";

/**
 * 정산 · 거래처의 더미 데이터. API가 붙으면 이 파일만 지운다.
 *
 * **숫자의 원본은 `01-pm.md` §7 검산표다.** 화면에 뜨는 미수 잔액 · 연체 · 마지막
 * 입금 · 합계는 여기 적힌 원장에서 전부 계산돼 나온다(`derive.ts`) — 잔액을 따로
 * 적어 두지 않는 것이 이 파일의 핵심 규칙이다.
 *
 * 원장은 **오래된 순**으로 적는다. 화면은 최신순이지만, 사람이 이 파일을 읽으며
 * 누적 잔액을 손으로 따라갈 수 있어야 검산이 된다.
 */

/**
 * 거래한 적 있는 도매처 4곳.
 *
 * `features/catalog`의 `WHOLESALERS`(마켓에 상품을 건 6곳)와 다른 집합이다 —
 * 주문한 적 없는 `더베이직`·`어반무드`는 여기 없다. 승인 층이 §3-0 A로 폐기돼
 * "거래처"를 가르는 축이 **주문 이력**밖에 안 남았다.
 * feature끼리 직접 import하지 않으므로(`CLAUDE.md`) 상호는 여기 다시 적는다.
 *
 * 계좌는 확정 와이어프레임의 마스킹 더미 그대로다. 실제 계좌번호 형식은
 * 미확인이라 지어내지 않는다.
 */
export const TRADE_PARTNERS: readonly TradePartner[] = [
  {
    wholesalerId: "w-moodon",
    name: "무드온",
    bank: { bankName: "국민", accountNo: "000000-00-000000", holder: "무드온" },
    location: "청평화패션몰 2층 24호",
    lastOrderedAt: "2026-08-31",
    ongoingCount: 1,
    backorderSheets: 0,
    backorderDelayed: false,
    phone: "02-000-0000",
  },
  {
    wholesalerId: "w-denim",
    name: "데님하우스",
    bank: {
      bankName: "국민",
      accountNo: "000000-00-000000",
      holder: "데님하우스",
    },
    /* `디오트 2층 18호`가 아니다 — 확정 와이어프레임 2장(`12_partners`·
       `09_order_detail`)이 이 값으로 일치하고, 기존 fixture 값은 근거가 없었다 */
    location: "디오트 지하 1층 12호",
    lastOrderedAt: "2026-08-28",
    ongoingCount: 1,
    backorderSheets: 10,
    backorderDelayed: false,
    phone: "02-000-0000",
  },
  {
    wholesalerId: "w-cotton",
    name: "코튼클럽",
    bank: {
      bankName: "국민",
      accountNo: "000000-00-000000",
      holder: "코튼클럽",
    },
    location: "디오트 3층 51호",
    lastOrderedAt: "2026-08-24",
    ongoingCount: 1,
    backorderSheets: 15,
    backorderDelayed: false,
    phone: "02-000-0000",
  },
  {
    wholesalerId: "w-lavien",
    name: "라비앙",
    bank: { bankName: "국민", accountNo: "000000-00-000000", holder: "라비앙" },
    location: "청평화패션몰 3층 8호",
    lastOrderedAt: "2026-08-16",
    ongoingCount: 1,
    /* 미송 3건 41장 = 10 + 15 + 16. `10_backorder.html`의 3건과 같은 값이라
       미송 화면이 생겨도 두 화면이 갈리지 않는다 */
    backorderSheets: 16,
    backorderDelayed: true,
    phone: "02-000-0000",
  },
];

/**
 * 거래 원장 4벌.
 *
 * 검산 지점 셋 — 이 셋이 어긋나면 fixture가 틀린 것이다.
 * 1. 도매처별 `delta` 합 = 미수 잔액 (무드온 589,000 · 데님 180,000 · 코튼 90,000 · 라비앙 −30,000)
 * 2. 주문별 `출고액 − 배정된 입금`의 합도 같은 값이 나온다 (라비앙은 미배정 30,000을 뺀 값)
 * 3. 양수 잔액만 더한 총 미수 = 859,000원, 도매처 3곳
 */
export const LEDGER_ENTRIES: readonly LedgerEntry[] = [
  /* ── 무드온 ─────────────────────────────────────────────────────────
     08.12 출고 900,000에 입금 두 건(520,000 · 200,000)이 나눠 배정된다.
     08.02 출고 29,000은 아무 입금도 안 걸려 있어 유일한 연체 건이 된다. */
  {
    id: "lg-moodon-01",
    wholesalerId: "w-moodon",
    date: "2026-08-02",
    kind: "SHIPMENT",
    statementNo: "JG-20260802-001",
    orderNo: "ORD-2608020006",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 29000,
  },
  {
    id: "lg-moodon-02",
    wholesalerId: "w-moodon",
    date: "2026-08-12",
    kind: "SHIPMENT",
    statementNo: "JG-20260812-004",
    orderNo: "ORD-2608120014",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 900000,
  },
  {
    id: "lg-moodon-03",
    wholesalerId: "w-moodon",
    date: "2026-08-16",
    kind: "PAYMENT",
    statementNo: null,
    orderNo: "ORD-2608120014",
    allocated: 520000,
    unallocated: 0,
    method: "TRANSFER",
    delta: -520000,
  },
  {
    id: "lg-moodon-04",
    wholesalerId: "w-moodon",
    date: "2026-08-26",
    kind: "SHIPMENT",
    statementNo: "JG-20260826-007",
    orderNo: "ORD-2608240019",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 380000,
  },
  {
    id: "lg-moodon-05",
    wholesalerId: "w-moodon",
    date: "2026-08-28",
    kind: "PAYMENT",
    statementNo: null,
    orderNo: "ORD-2608120014",
    allocated: 200000,
    unallocated: 0,
    method: "TRANSFER",
    delta: -200000,
  },

  /* ── 데님하우스 ──────────────────────────────────────────────────── */
  {
    id: "lg-denim-01",
    wholesalerId: "w-denim",
    date: "2026-08-10",
    kind: "SHIPMENT",
    statementNo: "JG-20260810-002",
    orderNo: "ORD-2608100009",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 150000,
  },
  {
    id: "lg-denim-02",
    wholesalerId: "w-denim",
    date: "2026-08-20",
    kind: "PAYMENT",
    statementNo: null,
    orderNo: "ORD-2608100009",
    allocated: 150000,
    unallocated: 0,
    method: "TRANSFER",
    delta: -150000,
  },
  {
    id: "lg-denim-03",
    wholesalerId: "w-denim",
    date: "2026-08-28",
    kind: "SHIPMENT",
    statementNo: "JG-20260828-011",
    orderNo: "ORD-2608260021",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 180000,
  },

  /* ── 코튼클럽 ────────────────────────────────────────────────────────
     결제 수단이 `현금`인 유일한 입금이다 — 두 수단이 화면에 다 서게 하려고 남긴다 */
  {
    id: "lg-cotton-01",
    wholesalerId: "w-cotton",
    date: "2026-08-14",
    kind: "SHIPMENT",
    statementNo: "JG-20260814-005",
    orderNo: "ORD-2608140016",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 240000,
  },
  {
    id: "lg-cotton-02",
    wholesalerId: "w-cotton",
    date: "2026-08-18",
    kind: "PAYMENT",
    statementNo: null,
    orderNo: "ORD-2608140016",
    allocated: 240000,
    unallocated: 0,
    method: "CASH",
    delta: -240000,
  },
  {
    id: "lg-cotton-03",
    wholesalerId: "w-cotton",
    date: "2026-08-24",
    kind: "SHIPMENT",
    statementNo: "JG-20260824-009",
    orderNo: "ORD-2608240018",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 90000,
  },

  /* ── 라비앙 ──────────────────────────────────────────────────────────
     미배정 입금이 있는 유일한 도매처다. 350,000을 보냈는데 320,000만 주문에
     걸려서 30,000이 남았고, 그만큼 잔액이 음수(= 선수금)로 내려간다. */
  {
    id: "lg-lavien-01",
    wholesalerId: "w-lavien",
    date: "2026-07-29",
    kind: "SHIPMENT",
    statementNo: "JG-20260729-003",
    orderNo: "ORD-2607290004",
    allocated: null,
    unallocated: null,
    method: null,
    delta: 320000,
  },
  {
    id: "lg-lavien-02",
    wholesalerId: "w-lavien",
    date: "2026-08-02",
    kind: "PAYMENT",
    statementNo: null,
    orderNo: "ORD-2607290004",
    allocated: 320000,
    unallocated: 30000,
    method: "TRANSFER",
    delta: -350000,
  },
];
