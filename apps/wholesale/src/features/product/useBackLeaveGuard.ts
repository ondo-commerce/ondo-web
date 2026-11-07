"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { attachBackGuard, type BackGuardController } from "./backGuard";

/**
 * 브라우저 뒤로가기 이탈 가드(#255, D22의 남은 몫). 입력이 생기면 보초 history 항목을 하나
 * 쌓고, 뒤로가기가 보초를 먹고 내려온 popstate에서 `onOpen`(이탈 모달)을 부른다. 방식과
 * 경우별 동작은 `backGuard.ts`와 기획 §4-2 정책표가 원본이다.
 *
 * - 컨트롤러는 마운트에 한 번 붙인다. Strict Mode의 setup → cleanup → setup에도 보초는
 *   지금 항목의 표시를 보고 한 번만 넣는다(`backGuard.test.ts` ①).
 * - `savingRef`는 submit 시작부터 끝까지 켜진 ref다. 저장 중 뒤로가기는 모달 없이 머문다(hold).
 *   `isPending`이 아니라 ref인 이유: 수정의 PATCH와 상태 변경 사이에 `isPending`이 잠깐
 *   거짓이 되는 틈이 있다.
 * - 돌려주는 `leaveBack`은 뒤로가기가 연 모달의 `나가기`만 쓴다(`history.go(-2)`).
 *   `취소`와 Link가 연 모달의 `나가기`는 지금처럼 `router.push`다.
 *
 * 제약: 이력 메뉴로 여러 칸 건너뛰기는 막지 못한다 — popstate가 올 때 이미 다른 URL이다.
 */
export function useBackLeaveGuard(options: {
  /** 입력이 있거나 업로드 중 */
  dirty: boolean;
  leaving: boolean;
  dialogOpen: boolean;
  savingRef: RefObject<boolean>;
  onOpen: () => void;
  /** `go(-2)`가 갈 곳이 없을 때(앞 이력 없는 새 탭) 대신 갈 곳 */
  fallbackHref: string;
}): { leaveBack: () => void } {
  const router = useRouter();
  // 리스너를 렌더마다 갈아 끼우지 않는다 — popstate 때 최신 값만 ref로 본다
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const controller = useRef<BackGuardController | null>(null);
  useEffect(() => {
    const attached = attachBackGuard(window, {
      read: () => ({
        dirty: latest.current.dirty,
        leaving: latest.current.leaving,
        saving: latest.current.savingRef.current,
        dialogOpen: latest.current.dialogOpen,
      }),
      onOpen: () => latest.current.onOpen(),
      onFallback: () => router.replace(latest.current.fallbackHref),
    });
    controller.current = attached;
    return () => {
      attached.detach();
      controller.current = null;
    };
  }, [router]);

  const { dirty, leaving } = options;
  useEffect(() => {
    controller.current?.sync();
  }, [dirty, leaving]);

  const leaveBack = useCallback(() => controller.current?.leave(), []);
  return { leaveBack };
}
