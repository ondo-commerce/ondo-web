"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_SAVE_DELAY_MS } from "./constants";
import { appendToDraft } from "./derive";
import { chatDrafts } from "./draftStore";

/**
 * 입력창 글 하나와 그 방의 저장(loop-08e §4-2 2, 도매 `useRoomDraft` 복제). 키가 null이면(소매처 id 모름) 저장하지
 * 않는 그냥 state다 — 방을 떠나면 사라진다.
 *
 * - 첫 렌더 전에 복원한다(state 초깃값). 빈칸으로 한 번 그린 뒤 채우지 않는다
 * - 복원만으로는 쓰지 않는다. 사장이 글을 바꾼 뒤에만 쓴다 — 복원 전 빈 값으로 덮는 경로를 아예 없앤다
 * - 바뀌면 300ms 뒤 저장. 언마운트(방 옮김, 다른 화면 이동), 탭 숨김, `pagehide`(새로고침 포함)는 기다리지 않는다.
 *   저장 대상은 이 훅이 받은 키 하나다. 키는 마운트 때만 읽는다 — 방을 옮기면 부르는 쪽이 `key={roomId}`로 다시
 *   마운트해 새 키로 시작한다(§4-2 3, `ChatRoomView`의 `ChatBlock`)
 * - `discard`(보냄)는 대기 중 저장을 취소하고 키를 지운다. 그 뒤 떠날 때 저장이 옛 글을 되살리지 않게
 *   "안 쓴 변경 있음" 표시도 내린다
 *
 * 마지막 글과 "안 쓴 변경 있음"을 ref로 드는 이유: 떠날 때 저장은 언마운트, `pagehide` 같은 React 밖 순간에
 * 돈다. 그때 state 클로저는 옛 값일 수 있다.
 */
export function useRoomDraft(key: string | null) {
  const [text, setTextState] = useState(() =>
    key === null ? "" : (chatDrafts.read(key) ?? ""),
  );
  /* 마운트 때 세대. 로그아웃, 로그인 정리 뒤 언마운트 저장이 지운 키를 되살리지 않게(draftStore 머리말) */
  const [generation] = useState(() => chatDrafts.generation());
  const latest = useRef(text);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    cancelTimer();
    if (!dirty.current || key === null) return;
    dirty.current = false;
    chatDrafts.write(key, latest.current, generation);
  }, [cancelTimer, generation, key]);

  const setText = useCallback(
    (next: string) => {
      latest.current = next;
      dirty.current = true;
      setTextState(next);
      cancelTimer();
      timer.current = setTimeout(flush, DRAFT_SAVE_DELAY_MS);
    },
    [cancelTimer, flush],
  );

  /**
   * 영구 실패 글을 입력창 글 뒤에 붙인다(loop-12 §4-2 3, `appendToDraft`). 지금 글은 `latest`에서 읽는다 — 부르는 곳이
   * 말풍선 버튼이라 입력창 렌더의 클로저보다 새 값이어야 한다. `saveNow`는 붙인 직후 이동하는 갈래(403 승인 링크)용이다.
   * 300ms를 기다리지 않고 바로 쓴다 — 쓴 뒤 "안 쓴 변경"이 내려가 언마운트 저장이 같은 값을 다시 쓰거나 덮지 않는다
   */
  const append = useCallback(
    (body: string, saveNow: boolean) => {
      setText(appendToDraft(latest.current, body));
      if (saveNow) flush();
    },
    [flush, setText],
  );

  const discard = useCallback(() => {
    cancelTimer();
    dirty.current = false;
    latest.current = "";
    setTextState("");
    if (key !== null) chatDrafts.write(key, "", generation);
  }, [cancelTimer, generation, key]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { text, setText, append, discard };
}
