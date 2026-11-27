import type { RetailSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 소매 스펙에서 생성한 타입의 별칭(ADR-0002). 알림 op 2개는 초안(#304, `x-ondo-draft`)이다.
 * 도매 `features/notification/types.ts`와 이름이 같지만 다른 타입이다 — target이 kind별 두 갈래다.
 * ------------------------------------------------------------------------ */

export type Notification = RetailSchema<"Notification">;
export type MarkNotificationsReadRequest =
  RetailSchema<"MarkNotificationsReadRequest">;
export type MarkNotificationsReadResult =
  RetailSchema<"MarkNotificationsReadResult">;
export type CursorPageMeta = RetailSchema<"CursorPageMeta">;

/** `GET /notifications` 한 장. 봉투가 커서(`nextCursor`)라 `apiFetchBody`로 통째로 받는다 */
export interface NotificationPage {
  data: Notification[];
  meta: CursorPageMeta;
}

/**
 * 캐시에 넣는 한 장. 그 장을 **보낼 때** 헤더 count가 몇 번째까지 나갔는지(`countsIssued`)를 같이 둔다 —
 * 그보다 먼저 떠난 count는 이 장보다 옛 값일 수 있어 새 알림 판단에서 뺀다(§4-2 5, Codex 2)
 */
export interface FetchedNotificationPage extends NotificationPage {
  countsIssued: number;
}

export type { HeaderCounts } from "@/shared/headerCounts";

/* ------------------------------------------------------------------------
 * 화면 모양
 * ------------------------------------------------------------------------ */

/** 헤더 아이콘 하나의 그리기 값. 배지 글자와 접근 이름이 같은 숫자에서 나온다 */
export interface BadgeView {
  /** 접근 이름("알림, 안 읽음 3개"). 숫자는 여기에만 한 번 */
  label: string;
  /** 배지 글자("3", "99+"). 없으면 배지를 안 그린다 */
  badge: string | null;
}

/**
 * 미송 입고일 알림 본문 `린넨 반팔 셔츠 아이보리/L 남은 28장, 입고일 미정 → 12/9(수)`를
 * 두 줄로 그리려고 나눈 값. 서버는 한 줄 문장만 준다
 */
export interface EtaBody {
  /** `린넨 반팔 셔츠 아이보리/L` */
  item: string;
  /** `28장` */
  qty: string;
  /** 바뀌기 전 날짜. 처음 지정(전이 `미정`)이면 null이고 화면은 `확정`을 붙인다 */
  from: string | null;
  /** 새 날짜 `12/9(수)`. 날짜가 지워졌으면 `미정` */
  to: string;
}

/** 패널 행 하나 */
export interface NotificationRowView {
  id: number;
  title: string;
  /** 본문(두 줄까지). 모르는 type이면 null(title만 그린다) */
  body: string | null;
  /** 미송 입고일 본문을 나눈 값. 꼴이 다르면 null이고 `body`를 그대로 그린다 */
  eta: EtaBody | null;
  /** "방금", "3분 전", "10/28 14:20" */
  time: string;
  unread: boolean;
  /** 누르면 갈 곳. 모르는 type이나 kind면 null — 읽음만 하고 이동하지 않는다 */
  href: string | null;
}

/**
 * 패널 위쪽 한 줄 안내. 다음 누름에서 사라진다.
 * `changed` 409, `newerFirst` 새 알림 줄이 뜬 채 모두 읽음, `markFailed` 읽음 실패, `sessionLost` 읽음 401
 */
export type PanelNotice =
  "changed" | "newerFirst" | "markFailed" | "sessionLost" | null;
