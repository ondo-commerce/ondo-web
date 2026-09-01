import { cn } from "@ondo/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { QTY_UNIT } from "@/shared/qty";
import { FILTER_ALL, FILTER_ALL_LABEL, SORT_LABEL } from "../constants";
import { backorderHref, toggledSort } from "../derive";
import type { BackorderSort, BackorderSummary, WholesalerChip } from "../types";

/**
 * 도매처 칩 + 결과 카운터 + 정렬(`_base.css` `.toolbar`).
 *
 * **칩도 정렬도 버튼이 아니라 링크다.** 고른 값이 `?wholesaler=`·`?sort=`로 주소에
 * 실려야 새로고침·뒤로 가기·링크 공유에 살아남고(retail-market F6), 거래처 관리의
 * 미송 배지(RT-66)가 같은 주소로 이 화면에 들어올 수 있다.
 *
 * `features/catalog`의 `filterChipClass`를 가져오지 않는다 — feature끼리 직접
 * import는 ESLint가 막는다. 규격(`.fbtn` h32 r8)만 맞춘 것을 여기 둔다(Rule of Two: 아직 1곳).
 */
export function BackorderToolbar({
  chips,
  wholesalerId,
  sort,
  summary,
}: {
  /** `전체`를 뺀 도매처들. 미송 데이터에서 파생된 목록이다 */
  chips: readonly WholesalerChip[];
  wholesalerId: string;
  sort: BackorderSort;
  /** 카운터가 표·요약 카드와 **같은 집합**을 읽는다는 것이 이 prop의 요점이다 */
  summary: BackorderSummary;
}) {
  const all: WholesalerChip = { id: FILTER_ALL, name: FILTER_ALL_LABEL };
  const nextSort = toggledSort(sort);

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      {[all, ...chips].map((chip) => {
        const active = chip.id === wholesalerId;

        return (
          <Link
            key={chip.id}
            href={backorderHref(chip.id, sort)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "text-body flex h-8 items-center rounded-control px-3 whitespace-nowrap transition-colors",
              /* 켜진 칩은 **바탕과 글자가 둘 다** 뒤집힌다. 글자색만 같으면
                 어느 것이 켜진 것인지 색약·저대비 화면에서 안 갈린다(shipments F11) */
              active
                ? "bg-foreground text-card font-medium"
                : "bg-secondary text-secondary-foreground hover:bg-secondary-strong",
            )}
          >
            {chip.name}
          </Link>
        );
      })}

      {/* phone에서는 카운터 줄이 통째로 아래로 내려가 좌우 끝으로 벌어진다
          (`_base.css` `@media (max-width:40rem)`의 `.toolbar__end`) */}
      <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
        {/* 숫자만 잉크색이고 나머지는 muted다(`.result b`) — 훑을 때 수치가 먼저 잡힌다 */}
        <p className="text-muted-foreground text-body tabular-nums">
          미송{" "}
          <span className="text-foreground font-medium">
            {summary.waitingCount}
          </span>
          건 · 총{" "}
          <span className="text-foreground font-medium">
            {summary.totalQty.toLocaleString("ko-KR")}
          </span>
          {QTY_UNIT}
        </p>

        {/*
          정렬은 **2값 토글**이다. 사양이 말한 축은 주문일 하나뿐이고(RT-56) 확정
          와이어프레임에도 열린 목록이 없어서, 드롭다운을 지어내는 대신 반대쪽으로
          가는 링크 하나로 둔다. 버튼 글자가 **지금 걸린 정렬**이고, 누르면 무엇이
          되는지는 접근 가능한 이름이 말한다 — 글자만 보고는 "지금"인지 "다음"인지
          알 수 없기 때문이다.
        */}
        <Link
          href={backorderHref(wholesalerId, nextSort)}
          aria-label={`정렬 ${SORT_LABEL[sort]}, 눌러서 ${SORT_LABEL[nextSort]}으로 바꾸기`}
          className="text-body hover:bg-secondary text-foreground flex h-8 items-center gap-1 rounded-control px-2 whitespace-nowrap transition-colors"
        >
          {SORT_LABEL[sort]}
          <ChevronDown aria-hidden className="text-border-strong size-3" />
        </Link>
      </div>
    </div>
  );
}
