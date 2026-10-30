import {
  BADGE_MAX,
  HEADER_BACKOFF_MS,
  HEADER_POLL_MS,
  ORDER_HREF,
} from "./constants";
import type {
  BadgeView,
  FetchedNotificationPage,
  HeaderCounts,
  Notification,
  NotificationPage,
  NotificationRowView,
} from "./types";

/*
 * 알림의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다.
 * 시각 표시는 Asia/Seoul이다(계약 §5-2). 브라우저 시간대에 기대지 않고 +9시간을 직접 더한다.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

/* ------------------------------------------------------------------------
 * 헤더 배지와 주기
 * ------------------------------------------------------------------------ */

function badgeText(n: number): string | null {
  if (n <= 0) return null;
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(n);
}

/**
 * 종 배지(S11-2). 0이거나 count를 모르면(실패, 401) 알약 없이 이름은 "알림".
 * 숫자는 이름에 실제 값 그대로 — 알약만 "99+"로 줄인다.
 */
export function bellBadge(counts: HeaderCounts | undefined): BadgeView {
  const n = counts?.kind === "ok" ? counts.notifications : 0;
  return {
    label: n > 0 ? `알림, 안 읽음 ${n}개` : "알림",
    badge: badgeText(n),
  };
}

/** 채팅 링크 배지(S11-2, Q2). 같은 규칙, 단위는 "건" */
export function chatBadge(counts: HeaderCounts | undefined): BadgeView {
  const n = counts?.kind === "ok" ? counts.chatsNeedingReply : 0;
  return {
    label: n > 0 ? `채팅, 답 필요 ${n}건` : "채팅",
    badge: badgeText(n),
  };
}

/**
 * 연속 실패 n번 뒤 다음 간격(S11-14). 0이면 평소 30초, 1 → 60초, 2 → 120초, 3 이상 → 300초.
 */
export function headerBackoffMs(failures: number): number {
  if (failures <= 0) return HEADER_POLL_MS;
  const index = Math.min(failures, HEADER_BACKOFF_MS.length) - 1;
  return HEADER_BACKOFF_MS[index] ?? HEADER_POLL_MS;
}

/** count 쿼리의 다음 간격. 401이면 멈춘다(false) */
export function headerPollDelayMs(
  counts: HeaderCounts | undefined,
): number | false {
  if (counts === undefined || counts.kind === "ok") return HEADER_POLL_MS;
  if (counts.kind === "unauthorized") return false;
  return headerBackoffMs(counts.failures);
}

/** 실패 하나를 더한 값. 직전이 성공이었거나 처음이면 1부터 센다 */
export function failedCounts(prev: HeaderCounts | undefined): HeaderCounts {
  return {
    kind: "failed",
    failures: prev?.kind === "failed" ? prev.failures + 1 : 1,
  };
}

/** read 응답의 남은 안 읽음 수를 배지에 먼저 넣는다. count를 모르는 상태면 그대로 둔다 */
export function withUnread(
  prev: HeaderCounts | undefined,
  notifications: number,
): HeaderCounts | undefined {
  return prev?.kind === "ok" ? { ...prev, notifications } : prev;
}

/** 지금 count가 아는 안 읽음 수. 모르면 null */
export function unreadOf(counts: HeaderCounts | undefined): number | null {
  return counts?.kind === "ok" ? counts.notifications : null;
}

/**
 * "새 알림 N개 보기" 줄을 띄울까(S11-10). **수가 아니라 가장 최근 id**로 본다(loop-06b, 05b-2 F3) — 연 뒤 다른
 * 기기가 하나 읽고 새 것이 하나 오면 수는 같아도 id가 다르다. 목록을 엿보지 않는다(GET 0, 03-review M1 M2).
 *  - count를 모르거나 첫 장이 아직 없으면 false
 *  - 칸이 없음(`undefined`, 구버전 서버) → false(기능 끔). `null`(알림 0개) → false
 *  - 그 count가 첫 장 요청보다 **먼저** 떠났으면 false — 늦게 와도 첫 장보다 옛 값이다
 *  - 그 밖에는 첫 장이 비었거나 첫 행 id가 다르면 true
 */
export function hasNewer(
  counts: HeaderCounts | undefined,
  firstPage: FetchedNotificationPage | undefined,
): boolean {
  if (counts?.kind !== "ok" || firstPage === undefined) return false;
  const latest = counts.latestNotificationId;
  if (latest === undefined || latest === null) return false;
  if (counts.started <= firstPage.countsIssued) return false;
  const first = firstPage.data[0];
  return first === undefined || first.id !== latest;
}

/**
 * 줄의 N. 띄울지는 `hasNewer`가 정하고, N은 연 때보다 늘어난 안 읽음 수다. 다른 기기가 그 사이 읽어
 * 수가 안 늘었어도 id가 바뀌었으면 새 것은 적어도 1개라 1로 쓴다(F3 장면 "새 알림 1개 보기").
 * 그래서 N은 하한이다 — 연 뒤 2개 읽히고 3개 오면 1로 보인다. 0이면 줄이 없다.
 */
export function newerCount(
  openedUnread: number | null,
  counts: HeaderCounts | undefined,
  firstPage: FetchedNotificationPage | undefined,
): number {
  if (!hasNewer(counts, firstPage)) return 0;
  const latest = unreadOf(counts);
  const grown =
    openedUnread === null || latest === null ? 0 : latest - openedUnread;
  return Math.max(grown, 1);
}

/* ------------------------------------------------------------------------
 * 패널 행
 * ------------------------------------------------------------------------ */

/** 화면이 아는 type. 이 밖의 값은 title만 그리고 이동하지 않는다(계약 "값이 늘 수 있다") */
const KNOWN_TYPES: ReadonlySet<string> = new Set<Notification["type"]>([
  "NEW_ORDER",
  "ORDER_CANCELLED",
]);

function kstParts(ms: number) {
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    day: Math.floor((ms + KST_OFFSET_MS) / (24 * HOUR_MS)),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

/**
 * 상대 시각(01-plan §4-1 6). 1분 안 "방금", 1시간 안 "N분 전", 같은 날 "N시간 전",
 * 어제부터 "10/28 14:20". 날짜 경계는 서울 자정. 미래 시각(시계 오차)은 "방금".
 */
export function relativeTime(createdAt: string, nowMs: number): string {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return "";
  const diff = nowMs - ms;
  if (diff < MINUTE_MS) return "방금";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}분 전`;
  const then = kstParts(ms);
  if (then.day === kstParts(nowMs).day)
    return `${Math.floor(diff / HOUR_MS)}시간 전`;
  return `${then.month}/${then.date} ${then.hh}:${then.mm}`;
}

/**
 * wire → 행(S11-16). 모르는 type이면 body를 버리고 href 없음 — `<button>`으로 그려 읽음만 한다.
 * target이 ORDER가 아니어도 같다.
 */
export function toNotificationRow(
  n: Notification,
  nowMs: number,
): NotificationRowView {
  const known = KNOWN_TYPES.has(n.type) && n.target.kind === "ORDER";
  return {
    id: n.id,
    title: n.title,
    body: known ? n.body : null,
    time: relativeTime(n.createdAt, nowMs),
    unread: n.readAt === null,
    href: known ? ORDER_HREF(n.target.id) : null,
  };
}

/**
 * 받은 장들을 한 목록으로. 이어 받은 장에 앞 장과 같은 id가 있으면 앞 것만 남긴다(S11-11 중복 0).
 * 순서는 서버 순서 그대로.
 */
export function flattenPages(
  pages: readonly NotificationPage[],
): Notification[] {
  const seen = new Set<number>();
  const rows: Notification[] = [];
  for (const page of pages)
    for (const n of page.data) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      rows.push(n);
    }
  return rows;
}

/**
 * 받은 장에서 읽음으로 표시한다. `ids`가 null이면 전부(모두 읽음 성공). 이미 읽은 행의 `readAt`은 그대로.
 */
export function markPagesRead<T extends { pages: NotificationPage[] }>(
  data: T,
  ids: ReadonlySet<number> | null,
  readAt: string,
): T {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((n) =>
        n.readAt === null && (ids === null || ids.has(n.id))
          ? { ...n, readAt }
          : n,
      ),
    })),
  };
}
