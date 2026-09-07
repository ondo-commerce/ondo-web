"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { useCreateOutboundMutation } from "../api/mutations";
import { OUTBOUND_CREATE_FIELDS } from "../constants";
import {
  canPack,
  hasMixedReceiveBy,
  missingCount,
  outboundErrorText,
  sumQty,
  toOutboundCreateRequest,
} from "../derive";
import type { OutboundCreated, PackingRowView } from "../types";
import { toFieldErrors } from "@/shared/api/fieldErrors";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 `포장 작업` 패널. 좌측 표에서 체크한 줄이 그대로 봉투 하나(`POST /outbounds`)가 된다.
 *
 * 포장 단위는 주문이 아니라 **소매처 × 선택 품목**이다 — 한 주문이 여러 포장으로
 * 쪼개지고 여러 주문이 한 포장으로 합쳐진다(서버가 포장을 분할한다). 그래서 여기 목록에 주문코드가 없다.
 *
 * 수령 방식이 섞이면 버튼만 막고 선택은 그대로 둔다(게이트 Q3). 무엇을 빼야 하는지
 * 보려면 섞인 상태가 화면에 남아 있어야 한다. 서버도 400 `RECEIVE_BY_MIXED`로 뒤를 받친다.
 *
 * 서버 쿼리를 직접 보지 않는다 — 선택은 체크한 순간의 스냅샷이고, "지금 목록에 없는 줄"은
 * 펼침 표가 알려 준 id로 센다. `Panel`은 부르는 쪽이 그린다.
 */
export function PackingWorkPanel({
  rows,
  visibleIds,
  stale,
  onRefresh,
  onDone,
}: {
  /** 체크된 줄(스냅샷). 비어 있으면 이 패널은 아예 그리지 않는다 */
  rows: readonly PackingRowView[];
  /** 지금 펼침 표에 있는 줄 id. 표를 못 받았으면 null */
  visibleIds: ReadonlySet<number> | null;
  /** 직전 처리 뒤 목록 재조회가 실패한 상태. 옛 목록으로 한 번 더 포장하지 않게 잠근다 */
  stale: boolean;
  /** `stale`일 때 `다시 불러오기` — 뮤테이션과 같은 무효화 */
  onRefresh: () => void;
  onDone: (created: OutboundCreated, refreshed: boolean) => void;
}) {
  const mixed = hasMixedReceiveBy(rows);
  const missing = missingCount(rows, visibleIds);
  const create = useCreateOutboundMutation({ onDone });

  /* 서버 오류: `VALIDATION_FAILED`는 칸 이름으로(칸이 하나라 폼 위 한 줄), 나머지(400 섞임·409·404·5xx)는 코드별 문구 */
  const errorText = create.error
    ? (() => {
        const fields = toFieldErrors(create.error, OUTBOUND_CREATE_FIELDS);
        if (fields) return fields.packingItemIds ?? fields._form ?? null;
        return outboundErrorText(create.error);
      })()
    : null;

  return (
    <>
      <Panel.Title sub="대기열에서 선택한 품목을 묶어 포장합니다">
        포장 작업
      </Panel.Title>

      <Panel.Body>
        {/* 검색으로 목록에서 빠진 줄. 지우지 않고 알린다 — 지우면 검색 중엔 포장을 못 한다(#198 판정) */}
        {missing > 0 ? (
          <Notice className="mb-3">
            현재 목록 조건에 없는 품목 {missing}줄이 선택에 남아 있어요.
          </Notice>
        ) : null}

        <Panel.Section title={`총 ${rows.length}개 상품`}>
          <ul className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  {row.productName}{" "}
                  <span className="text-muted-foreground">({row.sku})</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatNumber(row.qty)}개
                </span>
              </li>
            ))}
          </ul>
        </Panel.Section>
      </Panel.Body>

      <div className="border-border mt-4 shrink-0 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">선택 상품 합계</span>
          <span className="text-lg font-medium tabular-nums">
            {formatNumber(sumQty(rows))}개
          </span>
        </div>

        {mixed ? (
          <Notice className="mt-4">
            직접 수령과 사입삼촌은 한 포장으로 묶을 수 없습니다. 한 가지 수령
            방식만 남겨 주세요.
          </Notice>
        ) : null}

        {/* 거절 사유·옛 목록 경고는 버튼 위 한 줄 — 패널 안, 선택 바로 아래다 */}
        {errorText ? (
          <p role="alert" className="text-destructive-strong mt-4 text-sm">
            {errorText}
          </p>
        ) : stale ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive-strong text-sm">
              목록을 새로 못 불러왔어요. 옛 목록으로는 포장하지 않아요.
            </p>
            <Button type="button" variant="line" size="sm" onClick={onRefresh}>
              다시 불러오기
            </Button>
          </div>
        ) : null}

        <Button
          size="lg"
          className="mt-4"
          disabled={!canPack(rows) || create.isPending || stale}
          onClick={() => create.mutate(toOutboundCreateRequest(rows))}
        >
          {create.isPending ? "포장 중…" : "포장 완료"}
        </Button>
      </div>
    </>
  );
}
