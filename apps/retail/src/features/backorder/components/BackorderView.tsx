import { Panel } from "@ondo/ui";
import { BackorderSummary } from "./BackorderSummary";
import { BackorderTable } from "./BackorderTable";
import { BackorderToolbar } from "./BackorderToolbar";
import { BACKORDER_SUB } from "../constants";
import {
  filterByWholesaler,
  sortByOrderedAt,
  summarize,
  wholesalerChips,
} from "../derive";
import type { BackorderLine, BackorderSort } from "../types";

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
 * 입력칸이 하나도 없다. 소매는 미송을 만들지도 고치지도 못하고(RT-59), 배분은
 * 도매의 일이다(`glossary` §4.8 · §3-0 E) — 읽기 전용인 것이 이 화면의 성격이다.
 */
export function BackorderView({
  lines,
  today,
  wholesalerId,
  sort,
}: {
  lines: readonly BackorderLine[];
  /** `fixtures.ts`의 고정 상수. 렌더 중에 `new Date()`를 부르지 않는다 */
  today: string;
  /** 주소에서 정리돼 들어온 값. 여기 도달한 시점에는 반드시 칩 목록 안의 값이다 */
  wholesalerId: string;
  sort: BackorderSort;
}) {
  const visible = sortByOrderedAt(
    filterByWholesaler(lines, wholesalerId),
    sort,
  );
  const summary = summarize(visible, today);

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
        <BackorderToolbar
          chips={wholesalerChips(lines)}
          wholesalerId={wholesalerId}
          sort={sort}
          summary={summary}
        />

        {/* 패널 안쪽 여백을 지나 좌우 끝까지 긋는다 (`_base.css` `.hr{margin:0 -16px}`) */}
        <div className="bg-border -mx-4 h-px" />

        <BackorderTable
          lines={visible}
          today={today}
          totalQty={summary.totalQty}
        />
      </Panel>
    </div>
  );
}
