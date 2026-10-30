/*
 * 헤더 count 하나(`GET /notifications/unread-count`)가 두 배지(채팅 링크, 알림 종)를 같이 채운다(loop-06b §4-1 1).
 * 06a에선 `features/chat` 안에 있었는데 06b 종이 두 번째 사용처가 되어 여기로 내렸다(Rule of Two) —
 * feature끼리는 import할 수 없다. 규칙은 도매 `features/notification/derive.ts`와 같다(앱 사이 import 금지라 복제).
 *
 * 이 파일은 순수 함수와 타입만 둔다. 요청과 캐시는 `shared/api/headerCounts.ts`.
 */

/**
 * 헤더 count 주기(D36③). 활성 탭당 분당 2회라 열린 방 polling(3초)보다 훨씬 적다.
 * 도매 `features/notification/constants.ts`와 같은 값이다.
 */
export const HEADER_POLL_MS = 30_000;

/**
 * 연속 실패 뒤 다음 간격. 1번째 실패 뒤 60초, 2번째 120초, 3번째부터 300초(06a §4-1 3).
 * BE에 `unread-count`가 아직 없어 실서버는 404를 계속 준다 — 셸 14화면이 30초마다 두드리지 않게 늘린다.
 */
export const HEADER_BACKOFF_MS = [60_000, 120_000, 300_000] as const;

/**
 * 헤더 count 쿼리의 값. **실패도 값이다** — queryFn이 던지지 않는다(도매 `HeaderCounts`와 같은 이유).
 * 던지면 401이 소매 전역 QueryCache를 지나 `/login` 전체 이동이 된다(`providers.tsx`, 쓰던 글이 사라진다).
 * 그리고 TanStack의 실패 횟수는 요청마다 0으로 돌아가 "연속 몇 번 실패"를 셀 수 없다.
 */
export type HeaderCounts =
  | {
      kind: "ok";
      /** 내 방 안 읽은 메시지 합. 채팅 링크 배지 */
      chats: number;
      /** 안 읽은 알림 수. 종 배지(06b) */
      notifications: number;
      /**
       * 가장 최근 알림 id(초안 optional 칸). `undefined` = 구버전 서버라 칸이 없다 → 새 알림 줄을 끈다.
       * `null` = 내 알림이 0개. 둘을 섞지 않는다(§4-2 5)
       */
      latestNotificationId: number | null | undefined;
      /** 이 응답을 낸 요청의 시작 순번. 새 알림 판단이 "목록보다 먼저 떠난 count"를 거른다(`hasNewer`) */
      started: number;
    }
  /** 401, 403. 배지 없이 멈춘다. 다시 도는 건 새로고침이나 로그인 뒤(§4-1 3) */
  | { kind: "stopped" }
  /** 404, 500, 연결 실패. 배지 없이 간격만 늘린다. `failures`는 연속 실패 수(1부터) */
  | { kind: "failed"; failures: number };

/** 연속 실패 n번 뒤 다음 간격. 0이면 평소 30초, 1 → 60초, 2 → 120초, 3 이상 → 300초 */
export function headerBackoffMs(failures: number): number {
  if (failures <= 0) return HEADER_POLL_MS;
  const index = Math.min(failures, HEADER_BACKOFF_MS.length) - 1;
  return HEADER_BACKOFF_MS[index] ?? HEADER_POLL_MS;
}

/** count 쿼리의 다음 간격. 401, 403이면 멈춘다(false) */
export function headerPollDelayMs(
  counts: HeaderCounts | undefined,
): number | false {
  if (counts === undefined || counts.kind === "ok") return HEADER_POLL_MS;
  if (counts.kind === "stopped") return false;
  return headerBackoffMs(counts.failures);
}

/** 실패 하나를 더한 값. 직전이 성공이었거나 처음이면 1부터 센다 */
export function failedCounts(prev: HeaderCounts | undefined): HeaderCounts {
  return {
    kind: "failed",
    failures: prev?.kind === "failed" ? prev.failures + 1 : 1,
  };
}

/**
 * 이 count 응답을 버려야 하나(06a S2-6 나). count마다 시작 순번(`started`)을 달고, 읽음이 성공할 때 그때까지
 * 나간 마지막 순번을 울타리(`fence`)로 세운다. 울타리 안쪽에서 시작한 응답은 읽기 **전** 숫자를 들고 오므로
 * 늦게 도착하면 방금 사라진 배지를 되살린다. 같은 순번도 버린다 — 읽음과 같은 틱에 떠난 count다.
 */
export function isStaleCount(started: number, fence: number): boolean {
  return started <= fence;
}

/** 알림 읽음 응답의 남은 수를 배지에 먼저 넣는다(§4-2 3). count를 모르는 상태면 그대로 둔다 */
export function withUnreadNotifications(
  prev: HeaderCounts | undefined,
  notifications: number,
): HeaderCounts | undefined {
  return prev?.kind === "ok" ? { ...prev, notifications } : prev;
}
