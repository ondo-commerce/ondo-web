"use client";

import { Button, cn, Panel } from "@ondo/ui";
import { useEffect } from "react";
import { usePrepaidQuery } from "../api/queries";
import { retailerLabel } from "../derive";
import type { RetailerView } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 상단 — 펼친 거래처의 선수금 잔액 3카드(`GET /receivables/retailers/{id}/prepaid`).
 *
 * 총 입금액 · 배분 완료액 · **남은 선수금**(강조). 셋은 서버값이고 화면은 더하거나 빼지 않는다 —
 * 취소된 입금·취소된 배분을 빼는 규칙이 서버에 있어서 여기서 다시 세면 그 순간 갈린다.
 * 보조 문구(입금 회수·완료율·미정산 건수)는 Figma에 있지만 **서버가 주지 않아 안 그린다** — 더미를 두지 않는다.
 *
 * 입금 등록 패널 위에 놓인다. 입금 폼의 `총 사용 가능`이 이 값(남은 선수금)에 기대므로 같은 열에 붙여 둔다.
 * 이 쿼리는 **여기서만 들고** 받은 남은 선수금을 부모에게 알린다(`onPrepaidChange`) — 입금 폼이 같은 키를
 * 따로 보면 실패했을 때 `다시 시도`가 둘이 된다(wire-order F6). 펼침 본문의 확정 주문과 같은 흐름이다.
 * 경계는 카드 자리에만 — 제목은 서버와 무관하게 늘 있어야 한다.
 */
export function PrepaidSummaryPanel({
  retailer,
  onPrepaidChange,
  onRefresh,
}: {
  retailer: RetailerView;
  /** 받은 남은 선수금. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onPrepaidChange: (prepaid: number | null) => void;
  /** 재조회 실패 시 `다시 불러오기`. 부모의 것 하나를 쓴다 — 우측 패널의 잠금도 같이 풀려야 한다 */
  onRefresh: () => void;
}) {
  return (
    <Panel className="shrink-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm">선수금 잔액</h3>
        <span className="text-muted-foreground text-xs">
          {retailerLabel(retailer.name, retailer.code)}
        </span>
      </div>
      <QueryBoundary>
        <PrepaidCards
          retailerId={retailer.id}
          onPrepaidChange={onPrepaidChange}
          onRefresh={onRefresh}
        />
      </QueryBoundary>
    </Panel>
  );
}

/** 3카드. 안에서만 `useSuspenseQuery`를 부른다 */
function PrepaidCards({
  retailerId,
  onPrepaidChange,
  onRefresh,
}: {
  retailerId: number;
  onPrepaidChange: (prepaid: number | null) => void;
  onRefresh: () => void;
}) {
  const { data, isRefetchError } = usePrepaidQuery(retailerId);

  useEffect(() => {
    onPrepaidChange(data.prepaid);
    return () => onPrepaidChange(null);
  }, [data.prepaid, onPrepaidChange]);

  return (
    <>
      {/* 캐시엔 값이 있는데 재조회만 실패한 상태 — 경계가 못 잡는 유일한 실패라 여기서 한 줄 */}
      {isRefetchError ? (
        <p
          role="alert"
          className="text-destructive-strong mb-2 flex items-center justify-between gap-3 text-sm"
        >
          최신 선수금을 못 불러왔어요
          <Button type="button" variant="line" size="sm" onClick={onRefresh}>
            다시 불러오기
          </Button>
        </p>
      ) : null}
      <dl className="grid grid-cols-3 gap-2">
        <PrepaidCard label="총 입금액" value={data.totalPaid} />
        <PrepaidCard label="배분 완료액" value={data.totalAllocated} />
        {/* 세 번째만 강조 — 입금 폼이 실제로 쓰는 숫자는 이것뿐이다 */}
        <PrepaidCard label="남은 선수금" value={data.prepaid} emphasized />
      </dl>
    </>
  );
}

function PrepaidCard({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-control border px-3 py-2",
        emphasized ? "border-primary bg-accent" : "border-border",
      )}
    >
      <dt className="text-muted-foreground text-body">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg font-medium tabular-nums",
          emphasized && "text-primary",
        )}
      >
        {formatNumber(value)}원
      </dd>
    </div>
  );
}
