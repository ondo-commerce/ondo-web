import { KIND_LABEL, METHOD_LABEL } from "./constants";
import type {
  BankAccount,
  LedgerEntry,
  LedgerEntryWire,
  LedgerRow,
  OverdueInfo,
  PartnerSettlement,
  PartnerSettlementWire,
} from "./types";

/**
 * 두 화면의 파생값 전부. **JSX 안에서 더하지 않는다.**
 *
 * 이 파일이 하는 일은 둘이다.
 * ① wire → 뷰 변환(`toPartnerSettlements` · `toLedgerEntry`). null 좁힘·id 문자열화·
 *    계좌 모양 맞추기가 한 곳이라 화면은 wire 모양을 모른다.
 * ② 서버가 준 줄들을 **합치는** 것(총 미수 · 연체 합 · 최근 7일 입금 합). 요약 카드 ·
 *    표 `tfoot` · 거래처 표 합계가 같은 함수를 부르므로 한 곳만 안 따라오는 화면이
 *    없다 — 앞 회차 도매 `settlements`가 "필터를 걸면 잔액 열이 금액 열과 어긋난다"로
 *    그걸 겪었다.
 *
 * **잔액·연체·마지막 입금을 원장에서 다시 계산하지 않는다.** fixtures 시절의
 * `balanceOf`·`overdueOf`·`lastPaidAtOf`·`thisWeekPaid`는 지웠다(#240). 서버 잔액에는
 * 소매가 못 보는 줄(취소된 입금 · 조정)이 반영돼 있을 수 있어, 화면이 원장을 더한
 * 값과 서버 값이 다르면 **서버가 맞다.**
 */

/* ────────────────────────────────────────────────────────────────────────
   표시 형식 — 금액 · 날짜 · 부호 · 코드값
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 589000 → `589,000원`.
 *
 * `features/catalog`·`features/cart`에도 같은 이름이 있다. feature끼리 직접
 * import하지 않으므로 이 중복이 정답이다(`CLAUDE.md`).
 */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * `2026-08-28` → `2026.08.28`.
 *
 * 앞 10글자만 본다 — `lastPaidAt`이 date-time으로 넓어져도 날짜 칸이 시각까지
 * 끌고 들어오지 않게. 오프셋 보정은 안 한다: 서버가 `date` 형식으로 준다고 설명한다.
 */
export function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}

/**
 * 미수 잔액의 표시. **음수에 `-` 부호를 쓰지 않는다.**
 *
 * 잔액이 음수라는 건 더 보낸 돈이 남아 있다는 뜻이고, 그건 `-30,000원`이 아니라
 * `선수금 30,000원`이다(§3-0 E · A4). 부호는 원장의 `증감` 칸에만 쓴다 —
 * 거기서는 방향이 곧 사건(출고/입금)이라 부호가 정보고, 잔액에서는 부호 하나가
 * 뜻을 뒤집어서 잘못 읽히면 돌이킬 수 없다.
 */
export function formatBalance(balance: number): string {
  return balance < 0
    ? `선수금 ${formatWon(Math.abs(balance))}`
    : formatWon(balance);
}

/** 원장 `증감` 칸. 출고 `+380,000원` / 입금 `−200,000원` (U+2212 빼기 기호) */
export function formatDelta(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${formatWon(Math.abs(delta))}`;
}

/**
 * 원장 `구분` 칸. **모르는 코드는 코드값 그대로 세운다.**
 *
 * 도매 원장에 `PAYMENT_VOID`·`ADJUST`가 생겼고 소매 원장에도 올 수 있다. 빈 칸은
 * "구분 없음"으로 읽히고 `기타`는 진짜 종류처럼 읽힌다 — 코드가 그대로 보이면
 * 어긋난 값이 무엇인지 그 글자를 읽어 주는 것만으로 전해진다(`orderStatusLabel`과 같은 결).
 */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** 결제 수단. `현금` / `계좌 이체`, 모르는 코드는 그대로. 출고 행은 이 함수를 부르지 않고 `—`가 나간다 */
export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method;
}

/**
 * 원장 `근거` 칸.
 *
 * - 출고: `JG-20260908-001 · 20260908-0230-0002`
 * - 전액 배정된 입금: `20260908-0230-0002 배정`
 * - 일부만 배정된 입금: `20260908-0230-0002 배정 320,000 · 미배정 30,000`
 * - 어느 주문에도 안 걸린 입금: `미배정 30,000`
 *
 * 배정된 금액은 서버가 따로 안 준다 — `|delta| − unallocated`다. 미배정분을 **줄을
 * 쪼개지 않고 한 줄에** 적는 것이 핵심이다(A6). 쪼개면 그 줄의 `증감`이 실제 보낸
 * 금액과 달라져서 잔액 검산이 끊긴다. 모르는 `kind`도 여기로 온다 — 있는 번호를
 * 적고 없으면 `—`다. 없는 근거를 지어내지 않는다.
 */
export function formatBasis(entry: LedgerEntry): string {
  if (entry.kind === "SHIPMENT") {
    return [entry.statementNo, entry.orderNo]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }

  const unallocated = entry.unallocated ?? 0;
  if (entry.orderNo === null) {
    return unallocated > 0
      ? `미배정 ${unallocated.toLocaleString("ko-KR")}`
      : (entry.statementNo ?? "—");
  }
  if (unallocated === 0) return `${entry.orderNo} 배정`;

  const allocated = Math.abs(entry.delta) - unallocated;
  return `${entry.orderNo} 배정 ${allocated.toLocaleString("ko-KR")} · 미배정 ${unallocated.toLocaleString("ko-KR")}`;
}

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰. 화면은 wire 모양을 모른다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 계좌 셋을 한 덩어리로. **셋이 전부 있어야 계좌다** — 하나라도 비면 사장이 엉뚱한
 * 계좌로 보낸다(주문서 `toWholesaler`와 같은 규칙).
 *
 * `bank` 객체와 줄에 평평하게 실린 3필드를 **둘 다** 본다. 실측(2026-09-18)은 셋 다
 * `bank: null`이라 비null 모양이 미확정이고, 도매 스냅샷의 gateway 스키마는 평평한
 * 모양이다 — 어느 쪽이 와도 계좌 줄이 비지 않게 한다.
 */
export function toBankAccount(wire: PartnerSettlementWire): BankAccount | null {
  const nested = wire.bank ?? null;
  const bankName = pickString(nested?.bankName ?? wire.bankName);
  const accountNo = pickString(nested?.bankAccountNo ?? wire.bankAccountNo);
  const holder = pickString(
    nested?.bankAccountHolder ?? wire.bankAccountHolder,
  );

  return bankName !== null && accountNo !== null && holder !== null
    ? { bankName, accountNo, holder }
    : null;
}

/** 비어 있지 않은 문자열만. 빈 문자열은 없는 것과 같다 */
function pickString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toOverdue(wire: PartnerSettlementWire["overdue"] | null): OverdueInfo {
  return {
    amount: wire?.amount ?? 0,
    count: wire?.count ?? 0,
    maxDays: wire?.maxDays ?? 0,
  };
}

/**
 * `GET /settlements` → 도매처별 줄 전부. **미수 잔액 내림차순**이고 선수금(음수)은 맨 뒤다.
 *
 * 서버도 "빚이 큰 순"으로 준다고 하지만 여기서 한 번 더 정렬한다 — 정산 표·거래처
 * 표·도매처 전환 드롭다운이 같은 순서로 서야 사장이 같은 도매처를 같은 자리에서
 * 찾는다. 거래처 표의 옛 정렬 축(마지막 주문일)은 응답에 없다.
 */
export function toPartnerSettlements(
  wires: readonly PartnerSettlementWire[],
): PartnerSettlement[] {
  return wires
    .map<PartnerSettlement>((wire) => ({
      wholesalerId: String(wire.wholesalerId),
      name: wire.name ?? "",
      balance: wire.balance ?? 0,
      overdue: toOverdue(wire.overdue ?? null),
      lastPaidAt: wire.lastPaidAt ?? null,
      paidLast7Days: wire.paidLast7Days ?? 0,
      bank: toBankAccount(wire),
    }))
    .sort((a, b) => b.balance - a.balance);
}

/** 원장 한 줄. `allocations`는 옮기지 않는다 — 항목 모양이 미실측이라 화면이 안 읽는다 */
export function toLedgerEntry(wire: LedgerEntryWire): LedgerEntry {
  return {
    id: String(wire.id),
    date: wire.date,
    kind: wire.kind,
    statementNo: wire.statementNo ?? null,
    orderNo: wire.orderNo ?? null,
    method: wire.method ?? null,
    delta: wire.delta ?? 0,
    unallocated: wire.unallocated ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   원장 — 잔액 열
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 원장에 잔액을 붙여 **최신순**으로 돌려준다.
 *
 * 서버 잔액을 맨 윗줄에 놓고 아래로 내려가며 그 줄의 `delta`를 뺀다 — 한 줄 아래
 * 잔액은 "그 줄 직전의 잔액"이다. 오래된 줄부터 0에서 더해 올라오지 않는 이유:
 * ① 원장이 잘려 와도(옛 줄이 빠져도) 윗줄 잔액이 서버 값과 어긋나지 않는다.
 * ② 서버 잔액에는 소매가 못 보는 줄(취소된 입금 · 조정)이 반영돼 있을 수 있다 —
 *    원장을 더한 값과 다르면 서버가 맞고, 화면은 그 값을 맨 위에 세운다(#240).
 *
 * 최신순 정렬은 여기서 한다. 서버 순서(오래된 순이라고 설명)에 기대지 않고, 같은
 * 날짜면 id가 큰 쪽이 나중이다.
 */
export function runningBalance(
  entries: readonly LedgerEntry[],
  balance: number,
): LedgerRow[] {
  const newestFirst = [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id),
  );

  let remaining = balance;
  return newestFirst.map((entry) => {
    const row = { entry, balance: remaining };
    remaining -= entry.delta;
    return row;
  });
}

/* ────────────────────────────────────────────────────────────────────────
   화면 단위 집계 — 서버 줄들을 더하기만 한다
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 총 미수 = **양수 잔액만** 더한 값(A5).
 *
 * 선수금을 빼면 이 값이 "받을 돈"이 아니라 "순채권"이 되어 카드 이름과 어긋난다.
 * 표 `tfoot`도 같은 함수를 부르므로 카드와 표가 다른 값을 말할 수 없다.
 */
export function totalReceivable(rows: readonly { balance: number }[]): number {
  return rows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
}

/**
 * 합계에서 빠진 줄(선수금)이 표에 있는가.
 *
 * **있으면 그 사실을 표가 말해야 한다.** 규칙이 화면에 없으면 사장이 자기가 잘못
 * 더한 줄 알고 다시 센다(F5). 선수금이 한 줄도 없으면 문구를 붙이지 않는다 —
 * 빼는 게 없는데 `선수금 제외`라고 적으면 없는 규칙을 읽게 된다.
 */
export function hasPrepaid(rows: readonly { balance: number }[]): boolean {
  return rows.some((row) => row.balance < 0);
}

/** 총 미수 카드의 보조 문구가 세는 수 = 잔액이 **양수인** 도매처 수 */
export function receivablePartnerCount(
  rows: readonly PartnerSettlement[],
): number {
  return rows.filter((row) => row.balance > 0).length;
}

/** 연체 합계. 도매처별 연체를 그대로 합친다 — 카드와 표 `tfoot`이 같이 쓴다 */
export function totalOverdue(rows: readonly PartnerSettlement[]): OverdueInfo {
  return rows.reduce<OverdueInfo>(
    (acc, row) => ({
      amount: acc.amount + row.overdue.amount,
      count: acc.count + row.overdue.count,
      maxDays: Math.max(acc.maxDays, row.overdue.maxDays),
    }),
    { amount: 0, count: 0, maxDays: 0 },
  );
}

/**
 * `이번 주 보낸 입금` = 도매처별 `paidLast7Days`의 합. 창(오늘 포함 7일)은 서버가
 * 센다 — 도매처를 가리지 않고 전부 더한다. 카드는 "내가 이번 주에 얼마 보냈나"를
 * 묻는 자리라 어느 도매처인지는 그 아래 표가 답한다.
 */
export function totalPaidLast7Days(rows: readonly PartnerSettlement[]): number {
  return rows.reduce((sum, row) => sum + row.paidLast7Days, 0);
}

/**
 * 주소의 `?wholesaler=` 를 화면이 쓸 도매처 id로 정리한다.
 *
 * 값이 없거나 목록에 없는 값(옛 링크·오타·거래 없는 도매처)이면 **표 첫 줄**로
 * 떨어뜨린다. 그대로 두면 아무 도매처도 안 골라진 빈 원장이 떠서, 사장이 "거래가
 * 없다"고 읽는다. 목록에 있는 값만 통과하므로 숫자가 아닌 id로 서버를 부를 일이
 * 없다(`abc`는 400이다). 셸의 `resolveCategorySlug`가 같은 규약을 이미 쓴다.
 */
export function resolvePartnerId(
  value: string | null | undefined,
  rows: readonly PartnerSettlement[],
): string | null {
  const first = rows[0];
  if (!first) return null;

  return rows.some((row) => row.wholesalerId === value)
    ? (value ?? first.wholesalerId)
    : first.wholesalerId;
}

/** 고른 도매처 한 줄. 없으면 null — 거래처가 0곳인 화면이거나 거래 없는 도매처 홈이다 */
export function findSettlement(
  wholesalerId: string | null,
  rows: readonly PartnerSettlement[],
): PartnerSettlement | null {
  return rows.find((row) => row.wholesalerId === wholesalerId) ?? null;
}

/** `1건 · 최장 D+10`. 연체가 없으면 `0건` */
export function overdueSummaryText(overdue: OverdueInfo): string {
  return overdue.count === 0
    ? "0건"
    : `${overdue.count}건 · 최장 D+${overdue.maxDays}`;
}
