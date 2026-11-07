import {
  backGuardAction,
  BACK_GUARD_MARK,
  isBackGuardState,
  shouldPushGuard,
} from "./derive";

/**
 * 뒤로가기 이탈 가드의 window 쪽(#255). 훅(`useBackLeaveGuard`)이 effect에서 붙이고 뗀다.
 * window를 인자로 받는 이유: jsdom 없이 가짜 window로 Strict Mode 재실행과 대체 이동 타이머를
 * 시험하려고(`backGuard.test.ts`). 판정은 `derive.backGuardAction`이 하고 여기는 실행만 한다.
 *
 * 방식: App Router엔 이동을 막는 API가 없고 popstate는 취소가 안 된다. 그래서 입력이 생기면
 * 지금 URL 위에 보초 항목을 하나 쌓는다. 뒤로가기는 보초를 먹고 **같은 URL**의 폼 항목으로
 * 내려오므로 Next의 traverse는 같은 화면 복원이 되고(폼 state 유지), 그 popstate에서 판정한다.
 */

/** 가드가 쓰는 window 조각. 실제 `window`가 그대로 들어간다 */
export interface BackGuardWindow {
  history: {
    readonly state: unknown;
    pushState(data: unknown, unused: string): void;
    back(): void;
    go(delta: number): void;
  };
  location: { readonly pathname: string; readonly search: string };
  addEventListener(type: "popstate" | "pagehide", listener: () => void): void;
  removeEventListener(
    type: "popstate" | "pagehide",
    listener: () => void,
  ): void;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

/** popstate 때 읽는 화면 상태. 렌더마다 바뀌므로 값이 아니라 읽는 함수로 받는다 */
export interface BackGuardSnapshot {
  /** 입력이 있거나 업로드 중 */
  dirty: boolean;
  leaving: boolean;
  saving: boolean;
  dialogOpen: boolean;
}

export interface BackGuardHandlers {
  read: () => BackGuardSnapshot;
  /** 판정이 `open`. 화면이 이탈 모달을 연다 */
  onOpen: () => void;
  /** `leave()`의 `go(-2)`가 아무 데도 못 갔다(앞 이력 없는 새 탭). 화면이 목록으로 대체 이동 */
  onFallback: () => void;
}

export interface BackGuardController {
  /** 가드가 켜졌으면(입력 있음 또는 저장 중) 보초를 넣는다. 이미 보초 위면 아무것도 안 한다 */
  sync: () => void;
  /** 뒤로가기 모달의 `나가기`. 다시 넣은 보초 + 폼 항목을 건너 이전 화면으로 한 번에 */
  leave: () => void;
  /** 리스너와 타이머를 뗀다. 보초는 걷지 않는다 — 걷으면 `history.back()` = 이동이다 */
  detach: () => void;
}

/**
 * `go(-2)` 뒤 이만큼 popstate(같은 문서)도 pagehide(다른 문서)도 없으면 갈 곳이 없었다고 본다.
 * 경로 비교로 보면 같은 URL의 앞 항목(같은 폼을 두 번 연 이력)을 못 가린다.
 */
export const BACK_GUARD_FALLBACK_MS = 400;

function pushGuard(win: BackGuardWindow): void {
  // url을 넘기지 않는다 — 넘기면 Next가 같은 URL로 restore를 한 번 더 돌린다
  win.history.pushState({ [BACK_GUARD_MARK]: true }, "");
}

export function attachBackGuard(
  win: BackGuardWindow,
  handlers: BackGuardHandlers,
): BackGuardController {
  const formUrl = win.location.pathname + win.location.search;
  // 보초 위에서 마운트됐다(저장 뒤 뒤로가기, 보초 위 새로고침) = 이미 본 것으로 친다
  let sawGuard = isBackGuardState(win.history.state);
  let leaving = false;
  let fallbackTimer: number | null = null;

  const clearFallback = () => {
    if (fallbackTimer === null) return;
    win.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  };

  const onPopState = () => {
    clearFallback();
    const snap = handlers.read();
    const action = backGuardAction({
      leaving: leaving || snap.leaving,
      atFormUrl: win.location.pathname + win.location.search === formUrl,
      onGuardEntry: isBackGuardState(win.history.state),
      sawGuard,
      saving: snap.saving,
      guardActive: snap.dirty,
      dialogOpen: snap.dialogOpen,
    });
    switch (action) {
      case "ignore":
        return;
      case "continue":
        win.history.back();
        return;
      case "hold":
      case "keep":
        // 같은 popstate 안에서 동기적으로 — 그래야 다음 뒤로가기도 보초를 먹는다
        pushGuard(win);
        return;
      case "open":
        pushGuard(win);
        handlers.onOpen();
        return;
    }
  };

  win.addEventListener("popstate", onPopState);
  win.addEventListener("pagehide", clearFallback);

  return {
    sync: () => {
      const snap = handlers.read();
      // 저장 중도 켠다 — 변경 없이 저장을 누른 폼은 보초가 없어 뒤로가기가 hold 없이 빠진다(09-R1)
      const active = (snap.dirty || snap.saving) && !snap.leaving && !leaving;
      if (!shouldPushGuard(active, win.history.state)) return;
      pushGuard(win);
      sawGuard = true;
    },
    leave: () => {
      leaving = true;
      win.history.go(-2);
      clearFallback();
      fallbackTimer = win.setTimeout(() => {
        fallbackTimer = null;
        handlers.onFallback();
      }, BACK_GUARD_FALLBACK_MS);
    },
    detach: () => {
      win.removeEventListener("popstate", onPopState);
      win.removeEventListener("pagehide", clearFallback);
      clearFallback();
    },
  };
}
