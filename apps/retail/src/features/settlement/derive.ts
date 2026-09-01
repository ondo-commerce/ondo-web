import { OVERDUE_DAYS, PAID_WINDOW_DAYS, TODAY } from "./constants";
import { LEDGER_ENTRIES, TRADE_PARTNERS } from "./fixtures";
import type {
  LedgerEntry,
  LedgerRow,
  OverdueInfo,
  PartnerSettlement,
  PayMethod,
} from "./types";

/**
 * 두 화면의 파생값 전부. **JSX 안에서 더하지 않는다.**
 *
 * 요약 카드 · 도매처별 미수 표 · 원장 잔액 · 거래처 목록의 미수 열이 각자 더하면
 * 한 곳만 안 따라오는 화면이 된다 — 앞 회차 도매 `settlements`가 "필터를 걸면
 * 잔액 열이 금액 열과 어긋난다"로 그걸 겪었다. 여기서 나온 값 하나를 네 자리가
 * 나눠 쓴다.
 */

/* ────────────────────────────────────────────────────────────────────────
   표시 형식 — 금액 · 날짜 · 부호
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

/** `2026-08-28` → `2026.08.28` */
export function formatDate(iso: string): string {
  return iso.replaceAll("-", ".");
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

/** `계좌 이체` / `현금` 두 값뿐이다. 출고 행은 이 함수를 부르지 않고 `—`가 나간다 */
export function methodLabel(method: PayMethod): string {
  return method === "CASH" ? "현금" : "계좌 이체";
}

/**
 * 원장 `근거` 칸.
 *
 * - 출고: `JG-20260826-007 · ORD-2608240019`
 * - 전액 배정된 입금: `ORD-2608120014 배정`
 * - 일부만 배정된 입금: `ORD-2607290004 배정 320,000 · 미배정 30,000`
 *
 * 미배정분을 **줄을 쪼개지 않고 한 줄에** 적는 것이 핵심이다(A6). 쪼개면 그 줄의
 * `증감`이 실제 보낸 금액과 달라져서 잔액 검산이 끊긴다.
 */
export function formatBasis(entry: LedgerEntry): string {
  if (entry.kind === "SHIPMENT") {
    return entry.statementNo
      ? `${entry.statementNo} · ${entry.orderNo}`
      : entry.orderNo;
  }

  const unallocated = entry.unallocated ?? 0;
  if (unallocated === 0) return `${entry.orderNo} 배정`;

  const allocated = entry.allocated ?? 0;
  /* 한 푼도 안 걸린 입금은 주문번호를 적을 자리가 없다 — 없는 근거를 지어내지 않는다 */
  if (allocated === 0) return `미배정 ${unallocated.toLocaleString("ko-KR")}`;

  return `${entry.orderNo} 배정 ${allocated.toLocaleString("ko-KR")} · 미배정 ${unallocated.toLocaleString("ko-KR")}`;
}

/* ────────────────────────────────────────────────────────────────────────
   날짜 계산 — 연체와 입금 창이 같은 자를 쓴다
   ──────────────────────────────────────────────────────────────────────── */

/** ISO 날짜를 UTC 자정의 ms로. 로컬 시간대를 타면 자정 근처에서 하루가 어긋난다 */
function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** `from`에서 `to`까지 며칠인가. 뒤면 음수 */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

/* ────────────────────────────────────────────────────────────────────────
   원장 — 누적 잔액
   ──────────────────────────────────────────────────────────────────────── */

/** 그 도매처의 원장만 뽑는다. **다른 도매처 줄이 섞이면 잔액이 통째로 틀린다** */
export function ledgerOf(wholesalerId: string): LedgerEntry[] {
  return LEDGER_ENTRIES.filter((e) => e.wholesalerId === wholesalerId);
}

/**
 * 누적 잔액을 붙여 **최신순**으로 돌려준다.
 *
 * 오래된 줄부터 더한 뒤 뒤집는 이유: 잔액은 과거에서 현재로 쌓이는 값이라 그
 * 방향으로만 계산할 수 있고, 읽는 방향은 반대다. 그래서 맨 윗줄 잔액이 곧 그
 * 도매처의 미수 잔액이 된다 — 끝까지 스크롤하지 않아도 최종 잔액이 보인다.
 *
 * 넘겨받은 목록만으로 다시 누적한다. 도매처를 바꿔도 이전 도매처 금액이 남을
 * 자리가 없다(앞 회차 `필터 걸면 잔액이 금액과 어긋남`의 재발 방지).
 */
export function runningBalance(entries: readonly LedgerEntry[]): LedgerRow[] {
  /* 같은 날짜면 fixture에 적힌 순서를 그대로 쓴다 — Array.sort는 안정 정렬이다 */
  const oldestFirst = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  const rows = oldestFirst.map((entry) => {
    balance += entry.delta;
    return { entry, balance };
  });

  return rows.reverse();
}

/** 미수 잔액 = 그 원장의 증감 합. 음수면 선수금이다 */
export function balanceOf(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.delta, 0);
}

/** 마지막 입금일. 입금 이력이 없으면 null — 화면에는 `—`로 나간다 */
export function lastPaidAtOf(entries: readonly LedgerEntry[]): string | null {
  return entries
    .filter((entry) => entry.kind === "PAYMENT")
    .reduce<string | null>(
      (latest, entry) =>
        latest === null || entry.date > latest ? entry.date : latest,
      null,
    );
}

/* ────────────────────────────────────────────────────────────────────────
   연체 — 주문별 잔여로 센다
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 연체 = **출고 건마다** 배정된 입금을 뺀 잔여가 남아 있고, 그 출고의 기한이
 * 지난 것(A3). 잔액 전체를 하나로 보고 세지 않는다 — 그러면 언제부터 밀렸는지
 * 말할 수 없어 `최장 D+10` 같은 값이 안 나온다.
 *
 * 배정은 도매 사장이 수기로 정한 것을 받아 적은 값이다(§3-0 D). FIFO 자동 배정은
 * 폐기됐으므로 소매가 "아마 이 주문에 걸렸겠지"를 만들어 내지 않는다.
 *
 * 기한 당일(D+0)은 연체가 아니다 — 그날까지 보내면 되는 날이기 때문이다.
 */
export function overdueOf(entries: readonly LedgerEntry[]): OverdueInfo {
  const shipped = new Map<string, { amount: number; date: string }>();
  const allocated = new Map<string, number>();

  for (const entry of entries) {
    if (entry.kind === "SHIPMENT") {
      const prev = shipped.get(entry.orderNo);
      shipped.set(entry.orderNo, {
        amount: (prev?.amount ?? 0) + entry.delta,
        /* 같은 주문에 출고가 여러 번이면 **가장 이른 출고일**이 기한의 기준이다 */
        date: prev && prev.date < entry.date ? prev.date : entry.date,
      });
      continue;
    }

    allocated.set(
      entry.orderNo,
      (allocated.get(entry.orderNo) ?? 0) + (entry.allocated ?? 0),
    );
  }

  let amount = 0;
  let count = 0;
  let maxDays = 0;

  for (const [orderNo, { amount: shippedAmount, date }] of shipped) {
    const remaining = shippedAmount - (allocated.get(orderNo) ?? 0);
    if (remaining <= 0) continue;

    const days = daysBetween(date, TODAY) - OVERDUE_DAYS;
    if (days <= 0) continue;

    amount += remaining;
    count += 1;
    maxDays = Math.max(maxDays, days);
  }

  return { amount, count, maxDays };
}

/* ────────────────────────────────────────────────────────────────────────
   화면 단위 집계
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 도매처별 미수 표의 줄 전부. **미수 잔액 내림차순**이고 선수금(음수)은 맨 뒤다.
 *
 * 거래처 목록(`/wholesalers`)의 `미수 잔액` 열도 이 함수를 부른다 — 두 화면이
 * 같은 함수를 보게 해 두는 것이 "화면마다 금액이 다르다"를 막는 유일한 방법이다.
 */
export function partnerSettlements(): PartnerSettlement[] {
  return TRADE_PARTNERS.map((partner) => {
    const entries = ledgerOf(partner.wholesalerId);

    return {
      wholesalerId: partner.wholesalerId,
      name: partner.name,
      balance: balanceOf(entries),
      overdue: overdueOf(entries),
      lastPaidAt: lastPaidAtOf(entries),
      bank: partner.bank,
    };
  }).sort((a, b) => b.balance - a.balance);
}

/**
 * 총 미수 = **양수 잔액만** 더한 값(A5).
 *
 * 선수금을 빼면 이 값이 "받을 돈"이 아니라 "순채권"이 되어 카드 이름과 어긋난다.
 * 표 `tfoot` 합계도 같은 함수를 부르므로 카드와 표가 다른 값을 말할 수 없다.
 */
export function totalReceivable(rows: readonly PartnerSettlement[]): number {
  return rows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
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

export interface WeeklyPaid {
  amount: number;
  /** 창 안에서 가장 최근 입금. 카드 보조 문구(`2026.08.28 계좌 이체`)가 이걸 읽는다 */
  latest: LedgerEntry | null;
}

/**
 * `이번 주 보낸 입금` — 기준일 포함 직전 7일(2026.08.26~09.01)의 입금 합(A7).
 *
 * 도매처를 가리지 않고 전부 센다. 카드는 "내가 이번 주에 얼마 보냈나"를 묻는
 * 자리라 어느 도매처인지는 그 아래 표가 답한다.
 */
export function thisWeekPaid(
  entries: readonly LedgerEntry[] = LEDGER_ENTRIES,
): WeeklyPaid {
  const inWindow = entries.filter((entry) => {
    if (entry.kind !== "PAYMENT") return false;
    const ago = daysBetween(entry.date, TODAY);
    return ago >= 0 && ago < PAID_WINDOW_DAYS;
  });

  return {
    amount: inWindow.reduce((sum, entry) => sum + Math.abs(entry.delta), 0),
    latest: inWindow.reduce<LedgerEntry | null>(
      (latest, entry) =>
        latest === null || entry.date > latest.date ? entry : latest,
      null,
    ),
  };
}

/**
 * 주소의 `?wholesaler=` 를 화면이 쓸 도매처 id로 정리한다.
 *
 * 값이 없거나 목록에 없는 값(옛 링크·오타)이면 **표 첫 줄**로 떨어뜨린다.
 * 그대로 두면 아무 도매처도 안 골라진 빈 원장이 떠서, 사장이 "거래가 없다"고
 * 읽는다. 셸의 `resolveCategorySlug`가 같은 규약을 이미 쓴다.
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

/** 고른 도매처 한 줄. 없으면 null — 거래처가 0곳인 화면이다 */
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
