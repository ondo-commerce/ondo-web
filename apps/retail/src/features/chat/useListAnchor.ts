"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { pickListAnchor } from "./derive";
import type { VisibleListRow } from "./types";

/** 행 링크(`RoomRow`). 방 번호를 `data-room-id`에 들고 있다 */
const ROW_SELECTOR = "a[data-room-id]";

/** 목록 패널의 스크롤 칸(`ChatRoomListView`의 `Panel.Body`) */
const SCROLLER_SELECTOR = "[data-list-scroll]";

/**
 * 목록이 지금 어디서 스크롤하나(#455). 넓은 화면은 패널 안(방과 한 화면), 폰은 문서다. 패널 칸은 폰에서
 * `overflow: visible`이라 같은 요소가 있어도 문서로 본다. 창 크기가 바뀌면 답이 바뀌어 매번 다시 본다
 */
function panelScroller(list: HTMLElement | null): HTMLElement | null {
  const el = list?.closest<HTMLElement>(SCROLLER_SELECTOR) ?? null;
  return el !== null && getComputedStyle(el).overflowY !== "visible"
    ? el
    : null;
}

function scrollTopOf(panel: HTMLElement | null): number {
  return panel === null ? window.scrollY : panel.scrollTop;
}

/**
 * 셸 sticky 헤더의 아래끝. 그 아래부터가 "보이는" 자리다 — 헤더 밑에 깔린 행을 기준으로 잡으면 20번째 행이
 * 맨 위로 간 갱신에서 그 위 19번째 행을 붙잡아 21이 한 줄 올라간다(S4-2 ②). 셸 `<header>`는 하나뿐이다
 */
function stickyBottom(): number {
  const header = document.querySelector("header");
  return header === null
    ? 0
    : Math.max(0, header.getBoundingClientRect().bottom);
}

function rowIdOf(el: Element): number {
  return Number((el as HTMLElement).dataset.roomId);
}

/**
 * 지금 그려진 행 중 보이는 칸 안에 걸친 것만, 위에서부터. 각 행의 목록 전체 자리와 창 기준 위끝.
 * 보이는 칸은 문서 스크롤이면 헤더 아래 창, 패널 스크롤이면 그 칸이다
 */
function visibleRows(list: HTMLElement | null): VisibleListRow[] {
  if (list === null) return [];
  const panel = panelScroller(list);
  const box = panel?.getBoundingClientRect();
  const top = box === undefined ? stickyBottom() : box.top;
  const bottom = box === undefined ? window.innerHeight : box.bottom;
  const rows: VisibleListRow[] = [];
  list.querySelectorAll(ROW_SELECTOR).forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > top && rect.top < bottom)
      rows.push({ roomId: rowIdOf(el), index, top: rect.top });
  });
  return rows;
}

/**
 * `/chats` 갱신 중 보던 행 자리 지키기(loop-08e S4, 기획 §4-4).
 *
 * 목록은 받은 장을 바로 그려서 데이터가 바뀐 뒤엔 이미 바뀐 DOM만 남는다. 그래서 그리기 전 값을 미리 들고 있는다:
 * scroll(그리고 창 크기 변경) 이벤트마다 보이는 행의 자리와 위끝을 ref에 적고, 새 데이터나 안내 줄을 그린 뒤
 * 페인트 전(`useLayoutEffect`)에 `pickListAnchor`가 고른 행이 움직인 만큼 `scrollBy`로 되돌린다. 마운트와
 * `더 보기` 직후 값은 보정 끝에 다시 적어 둔다. 응답이 늦어 그 사이 사장이 스크롤했으면 마지막 scroll 값이 쓰인다
 * (요청 시작 때 재지 않는다). `scrollY`가 0이면 맨 위를 보던 것이라 건드리지 않는다 — 새로 올라온 첫 행이 보인다.
 * 넓은 화면은 목록이 방 옆 패널 안에서 스크롤한다(#455) — 그때는 위 scrollY, 창, scrollBy가 전부 그 패널 칸 기준이다.
 *
 * 브라우저 scroll anchoring은 목록 쪽에서 끈다(`overflow-anchor: none`, `ChatRoomListView`). 브라우저는 DOM 순서로
 * 첫 보이는 노드를 붙잡아 맨 위로 올라간 행을 기준으로 삼을 수 있고, 켜 두면 같은 변경을 두 번 보정한다.
 *
 * 보정은 행 위치를 바꿀 수 있는 그리기마다 돈다: 받은 장(`pages`, TanStack이 값이 같으면 같은 참조를 준다)과
 * 끊김 안내 줄(`sessionLost`). 순서가 같아도 돌지만 차이가 0이면 스크롤하지 않는다. 새 지연은 없다 — 측정과
 * 보정이 같은 커밋 단계 안이다.
 */
export function useListAnchor(
  listRef: RefObject<HTMLElement | null>,
  pages: unknown,
  sessionLost: boolean,
): void {
  const seen = useRef<VisibleListRow[]>([]);
  /* `seen`을 적을 때의 scrollY(리뷰 R16). 사장 스크롤이 scroll 이벤트 전에 갱신 커밋과 겹치면 `seen`의 위끝은 그
     스크롤 전 값이다 — 그 차이만큼은 사장이 옮긴 것이라 보정에서 뺀다 */
  const seenScrollY = useRef(0);
  /* 목록 아래 여유(px, 리뷰 R15). 문서 끝 근처(첫 장 30행의 20번째 아래)에선 보정에 필요한 scrollY가 문서 최대값을
     넘어 잘렸다(390 34px, 1280 6px). 모자란 만큼 목록 아래를 늘려 보정을 다 한다. 줄이지 않는다 — 줄이면 브라우저가
     scrollY를 다시 잘라 보던 행이 움직인다. 화면을 떠나면(언마운트) 없어진다 */
  const slack = useRef(0);

  useEffect(() => {
    const record = () => {
      seen.current = visibleRows(listRef.current);
      seenScrollY.current = scrollTopOf(panelScroller(listRef.current));
    };
    record();
    /* 캡처 단계로 문서에 건다 — 요소 스크롤은 버블되지 않아 창 리스너로는 패널 스크롤을 못 받는다 */
    document.addEventListener("scroll", record, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", record);
    return () => {
      document.removeEventListener("scroll", record, { capture: true });
      window.removeEventListener("resize", record);
    };
  }, [listRef]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const before = seen.current;
    const panel = panelScroller(list);
    const scrollTop = scrollTopOf(panel);
    if (list !== null && scrollTop > 0) {
      const elements = [...list.querySelectorAll(ROW_SELECTOR)];
      const anchorId = pickListAnchor(before, elements.map(rowIdOf));
      const was = before.find((row) => row.roomId === anchorId);
      const now = elements.find((el) => rowIdOf(el) === anchorId);
      if (was !== undefined && now !== undefined) {
        /* 적은 뒤 사장이 옮긴 만큼(아직 scroll 이벤트 전) 그 행의 기대 위끝도 같이 옮겨 본다 */
        const expectedTop = was.top - (scrollTop - seenScrollY.current);
        const delta = now.getBoundingClientRect().top - expectedTop;
        if (Math.abs(delta) >= 0.5) {
          const max =
            panel === null
              ? document.documentElement.scrollHeight - window.innerHeight
              : panel.scrollHeight - panel.clientHeight;
          const short = Math.ceil(scrollTop + delta - max);
          if (short > 0) {
            slack.current += short;
            list.style.paddingBottom = `${slack.current}px`;
          }
          (panel ?? window).scrollBy(0, delta);
        }
      }
    }
    seen.current = visibleRows(list);
    seenScrollY.current = scrollTopOf(panelScroller(list));
  }, [listRef, pages, sessionLost]);
}
