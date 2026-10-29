import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 알림 op 3개는 초안(#290, `x-ondo-draft`)이다.
 * BE가 구현해 sync-spec이 덮어쓰면 여기가 아니라 `codegen`이 알려준다.
 * ------------------------------------------------------------------------ */

export type Notification = WholesaleSchema<"Notification">;
export type NotificationType = WholesaleSchema<"NotificationType">;
export type NotificationUnreadCount =
  WholesaleSchema<"NotificationUnreadCount">;
export type MarkNotificationsReadRequest =
  WholesaleSchema<"MarkNotificationsReadRequest">;
export type MarkNotificationsReadResult =
  WholesaleSchema<"MarkNotificationsReadResult">;
export type CursorPageMeta = WholesaleSchema<"CursorPageMeta">;

/** `GET /notifications` 한 장. 봉투가 커서(`nextCursor`)라 `apiFetchBody`로 통째로 받는다 */
export interface NotificationPage {
  data: Notification[];
  meta: CursorPageMeta;
}

/* ------------------------------------------------------------------------
 * 헤더 count 상태. 쿼리 하나에 이 값이 산다.
 * ------------------------------------------------------------------------ */

/**
 * 헤더 count 쿼리의 값. **실패도 값이다** — queryFn이 던지지 않는다.
 *
 * 던지면 두 가지가 깨진다. 401은 전역 QueryCache가 `/login`으로 보낸다(쓰던 답이 날아간다, S11-13).
 * 그리고 TanStack의 `fetchFailureCount`는 요청마다 0으로 돌아가 "연속 몇 번 실패"를 셀 수 없다(S11-14).
 * 그래서 연속 실패 수를 값에 들고 다음 간격을 거기서 정한다(`headerPollDelayMs`).
 */
export type HeaderCounts =
  | {
      kind: "ok";
      /** 안 읽은 알림 수. 종 배지 */
      notifications: number;
      /** 답 필요 방 수. 채팅 링크 배지(Q2) */
      chatsNeedingReply: number;
    }
  /** 세션이 끊겼다. 배지 없이 멈춘다. 다시 도는 건 새로고침이나 로그인 뒤 */
  | { kind: "unauthorized" }
  /** 404, 500, 연결 실패. 배지 없이 간격만 늘린다. `failures`는 연속 실패 수(1부터) */
  | { kind: "failed"; failures: number };

/* ------------------------------------------------------------------------
 * 화면 모양
 * ------------------------------------------------------------------------ */

/** 헤더 아이콘 하나의 그리기 값. 배지 글자와 접근 이름이 같은 숫자에서 나온다 */
export interface BadgeView {
  /** 접근 이름. 숫자는 여기에만 한 번 있다("알림, 안 읽음 3개") */
  label: string;
  /** 알약 글자("3", "99+"). 없으면 알약을 안 그린다 */
  badge: string | null;
}

/** 패널 행 하나 */
export interface NotificationRowView {
  id: number;
  title: string;
  /** 한 줄 본문. 모르는 type이면 null(title만 그린다) */
  body: string | null;
  /** "방금", "3분 전", "10/28 14:20" */
  time: string;
  unread: boolean;
  /** 누르면 갈 곳. 모르는 type이나 target이면 null — 읽음만 하고 이동하지 않는다 */
  href: string | null;
}

/** 패널 위쪽 한 줄 안내. 다음 누름에서 사라진다 */
export type PanelNotice = "changed" | "markFailed" | null;
