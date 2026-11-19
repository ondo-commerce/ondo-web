import { BACKORDERS_HREF, BADGE_MAX, ORDER_HREF } from "./constants";
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
 * 도매 `features/notification/derive.ts`의 복제다(앱 사이 import 금지). 다른 점은 새 알림 판단(`hasNewer`, 수가
 * 아니라 첫 행 id)과 target 두 갈래(`toNotificationRow`)다. 시각 표시는 Asia/Seoul — +9시간을 직접 더한다.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

/* ------------------------------------------------------------------------
 * 헤더 종
 * ------------------------------------------------------------------------ */

/**
 * 종 배지(S2-1). 0이거나 count를 모르면(처음, 실패, 401/403 멈춤) 배지 없이 이름은 "알림".
 * 이름에는 실제 수 그대로, 배지만 "99+"로 줄인다.
 */
export function notificationBadgeLabel(
  counts: HeaderCounts | undefined,
): BadgeView {
  const n = counts?.kind === "ok" ? counts.notifications : 0;
  if (n <= 0) return { label: "알림", badge: null };
  return {
    label: `알림, 안 읽음 ${n}개`,
    badge: n > BADGE_MAX ? `${BADGE_MAX}+` : String(n),
  };
}

/** 지금 count가 아는 안 읽음 수. 모르면 null(`모두 읽음` 버튼을 안 그린다) */
export function unreadOf(counts: HeaderCounts | undefined): number | null {
  return counts?.kind === "ok" ? counts.notifications : null;
}

/**
 * "새 알림 보기" 줄을 띄울까(S2-7, §4-2 5). **수가 아니라 가장 최근 id**로 본다 — 다른 기기에서 하나 읽고 새 것이
 * 하나 오면 수는 같아도 id가 다르다(05b-2 F3).
 *  - count를 모르거나 첫 장이 아직 없으면 false
 *  - 칸이 없음(`undefined`, 구버전 서버) → false(기능 끔). `null`(내 알림 0) → false
 *  - 그 count가 첫 장 요청보다 **먼저** 떠났으면 false — 늦게 와도 옛 값이다(Codex 2)
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

/* ------------------------------------------------------------------------
 * 패널 행
 * ------------------------------------------------------------------------ */

/** 화면이 아는 type. 이 밖의 값은 title만 그리고 이동하지 않는다(계약 "값이 늘 수 있다") */
const KNOWN_TYPES: ReadonlySet<string> = new Set<Notification["type"]>([
  "ORDER_CONFIRMED",
  "BACKORDER_DATE_CHANGED",
  "BACKORDER_ALLOCATED",
  "SHIPPED",
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
 * 상대 시각(§4-2 2). 1분 안 "방금", 1시간 안 "N분 전", 같은 날 "N시간 전", 어제부터 "10/28 14:20".
 * 날짜 경계는 서울 자정. 미래 시각(시계 오차)은 "방금".
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

/** target → 갈 곳. 모르는 kind(서버가 갈래를 늘림)면 null. 타입은 두 갈래뿐이라 런타임 값을 문자열로 본다 */
function targetHref(target: Notification["target"]): string | null {
  const kind: string = target.kind;
  if (kind === "BACKORDERS" && "wholesalerId" in target)
    return BACKORDERS_HREF(target.wholesalerId);
  if (kind === "ORDER" && "orderId" in target)
    return ORDER_HREF(target.orderId);
  return null;
}

/**
 * wire → 행(S2-5). 모르는 type이면 body를 버리고 href 없음 — `<button>`으로 그려 읽음만 한다.
 * 아는 type이어도 target kind를 모르면 같다.
 */
export function toNotificationRow(
  n: Notification,
  nowMs: number,
): NotificationRowView {
  const href = KNOWN_TYPES.has(n.type) ? targetHref(n.target) : null;
  return {
    id: n.id,
    title: n.title,
    body: href === null ? null : n.body,
    time: relativeTime(n.createdAt, nowMs),
    unread: n.readAt === null,
    href,
  };
}

/**
 * 지금 주소가 그 행의 갈 곳과 같나(§4-2 3). 같으면 이동 대신 `router.refresh()`로 서버 화면을 다시 그린다 —
 * Next는 같은 주소 링크를 눌러도 서버 컴포넌트를 다시 받지 않아 새 입고일이 안 보인다.
 */
export function isCurrentAddress(
  href: string,
  location: { pathname: string; search: string },
): boolean {
  return href === `${location.pathname}${location.search}`;
}

/**
 * 받은 장들을 한 목록으로. 이어 받은 장에 앞 장과 같은 id가 있으면 앞 것만 남긴다(S2-4 중복 0).
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
 * 고르지 않은 행은 서버 값 그대로 둔다(S2-11 — 늦게 온 둘째 장의 안 읽은 점을 지우지 않는다).
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
