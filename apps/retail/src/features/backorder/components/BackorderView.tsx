import { Notice, Panel } from "@ondo/ui";
import { BackorderCards } from "./BackorderCards";
import { BackorderPager } from "./BackorderPager";
import { BackorderSummary } from "./BackorderSummary";
import { BackorderTable } from "./BackorderTable";
import { BackorderToolbar } from "./BackorderToolbar";
import { BACKORDER_SUB } from "../constants";
import {
  droppedNoticeText,
  filterByWholesaler,
  sortByOrderedAt,
  summarize,
  wholesalerChips,
} from "../derive";
import type {
  BackorderLine,
  BackorderPage,
  BackorderSort,
  DroppedWholesaler,
} from "../types";

/**
 * 미송 대기 현황 한 장 — 패널 2개(머리 + 요약 / 툴바 + 표).
 *
 * **이 화면의 유일한 구조적 약속은 `visible` 한 줄이다.** 도매처 필터와 정렬을 먼저
 * 걸어 "지금 표에 서는 목록"을 만들고, 요약 3카드 · 툴바 카운터 · 표 · 합계가 전부
 * 그 하나에서 나온다. 카드가 원본 목록을 따로 세면 도매처를 좁혔을 때 목록은 1줄인데
 * 카드는 3건인 화면이 된다 — shipments F8 · settlements F7이 같은 뿌리로 이미 두 번 났다.
 *
 * 서버 컴포넌트다. 필터·정렬을 `useState`로 들면 뒤로 가기와 새로고침에서 통째로
 * 사라지고(retail-market F6), 거래처 관리의 미송 배지(RT-66)가 걸 주소도 없어진다.
 *
 * `lines`는 **서버가 준 한 장(100건)**이다. 서버에 도매처·정렬 파라미터가 없어서 필터와
 * 정렬은 이 장 안에서만 걸린다 — 2장 이상이면 `BackorderPager`가 그 사실을 보여준다.
 *
 * 입력칸이 하나도 없다. 소매는 미송을 만들지도 고치지도 못하고(RT-59), 배분은
 * 도매의 일이다(`glossary` §4.8 · §3-0 E) — 읽기 전용인 것이 이 화면의 성격이다.
 */
export function BackorderView({
  lines,
  today,
  wholesalerId,
  sort,
  dropped,
  paging,
}: {
  lines: readonly BackorderLine[];
  /** page가 요청 시점에 `todayKst`로 한 번 만든 값. 렌더 중에 `new Date()`를 부르지 않는다 */
  today: string;
  /** 주소에서 정리돼 들어온 값. 여기 도달한 시점에는 반드시 칩 목록 안의 값이다 */
  wholesalerId: string;
  sort: BackorderSort;
  /**
   * 주소에 실렸다가 걸러진 도매처. 안 걸러졌으면 `null`이고 안내를 그리지 않는다.
   * 상호는 `features/catalog`만 아는 값이라 page가 찾아 넘긴다.
   */
  dropped: DroppedWholesaler | null;
  /** 서버 페이지 위치. 2장 이상일 때만 페이저가 선다 */
  paging: BackorderPage;
}) {
  const visible = sortByOrderedAt(
    filterByWholesaler(lines, wholesalerId),
    sort,
  );
  const summary = summarize(visible, today);
  const droppedNotice = droppedNoticeText(dropped);

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        {/* 화면의 첫 헤딩. `Panel.Title`이 h2를 그리고, 그 아래로 헤딩이 더 없다 —
            요약 카드 라벨을 헤딩으로 만들면 h2 다음이 h4가 되어 순서가 깨진다 */}
        <Panel.Title sub={BACKORDER_SUB}>미송 대기 현황</Panel.Title>
        <BackorderSummary summary={summary} />
      </Panel>

      {/* 패널 사이 8px (`_base.css` `.panel + .panel{margin-top:8px}`) */}
      <Panel className="mt-2">
        {/*
          **화면이 조용히 다른 걸 보여주지 않게 하는 한 줄이다.**

          `?wholesaler=w-basic`처럼 미송이 0건인 거래처로 들어오면 `전체`로 떨어지는데
          (S2-AC5), 그 사실을 말하지 않으면 거래처 관리 미송 배지(RT-66)를 타고 온
          사장에게는 `더베이직 미송 41장`으로 읽힌다 — 41장은 다른 세 곳 것이다(F2).

          칩 위에 둔다. 걸린 필터가 왜 `전체`인지를 **칩을 보기 전에** 읽어야 한다.
        */}
        {droppedNotice ? (
          <Notice className="mb-3">{droppedNotice}</Notice>
        ) : null}

        <BackorderToolbar
          chips={wholesalerChips(lines)}
          wholesalerId={wholesalerId}
          sort={sort}
          summary={summary}
        />

        {/* 패널 안쪽 여백을 지나 좌우 끝까지 긋는다 (`_base.css` `.hr{margin:0 -16px}`).
            색은 `border-soft`(gray-100)다 — 바로 아래 표의 행 구분선과 같은 단계여야 한다.
            `border`(gray-200)로 두면 이 한 줄만 유독 진하게 튄다(F4 · retail-shell F13) */}
        <div className="bg-border-soft -mx-4 h-px" />

        {/*
          같은 목록을 폭에 따라 **다른 모양으로** 그린다. 값은 둘 다 `visible` ·
          `summary.totalQty` 하나에서 나오므로 폭이 바뀌어도 말이 갈리지 않는다.

          경계가 `tablet`(≤960px)인 이유는 `BackorderCards`의 주석에 있다 —
          표가 안 잘리는 최소 뷰포트가 744px이라 640px에서 갈면 그 사이가 남는다.
        */}
        <div className="hidden pt-3 tablet:block">
          <BackorderCards
            lines={visible}
            today={today}
            totalQty={summary.totalQty}
          />
        </div>

        <div className="tablet:hidden">
          <BackorderTable
            lines={visible}
            today={today}
            totalQty={summary.totalQty}
          />
        </div>

        <BackorderPager
          paging={paging}
          wholesalerId={wholesalerId}
          sort={sort}
        />
      </Panel>
    </div>
  );
}
