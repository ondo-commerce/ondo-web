"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { AllocationTable } from "./AllocationTable";
import { useCreateAllocationMutation } from "../api/mutations";
import {
  allocationGapText,
  allocationIssues,
  allocationTargets,
  allocationTotal,
  depositErrorText,
  noticeText,
  parseNumberInput,
  resolveAllocations,
  retailerLabel,
  toAllocationRequest,
} from "../derive";
import type {
  AllocationCreated,
  AllocationDraft,
  OrderRowView,
  RetailerView,
  SettlementNotice,
} from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 패널 — **새 입금 없이** 남은 선수금을 출고된 주문에 붙이는 자리(`POST /allocations`).
 * 미송 선결제처럼 돈이 먼저 오고 물건이 나중에 나간 주문을 출고 뒤 정산하는 길이다(스펙). 원장은 안 바뀐다.
 *
 * 입금 등록 패널의 배분 표를 그대로 쓴다 — 상한만 `입금액 + 선수금`이 아니라 `남은 선수금`이다.
 * 진입은 3카드 패널의 `선수금으로 정산`이고, 정산이 끝나면 부모가 입금 등록 패널로 되돌린다.
 *
 * 폼 상태(`draft`)는 부모가 든다. 입금 폼과 같은 이유로 입력이 바뀔 때마다 `Idempotency-Key`가 새로 나온다.
 */
export function PrepaidAllocationPanel({
  retailer,
  orders,
  prepaid,
  draft,
  onDraftChange,
  stale,
  notice,
  onRefresh,
  onCancel,
  onDone,
}: {
  retailer: RetailerView;
  /** 이 거래처의 확정 주문. 좌측 펼침 본문이 넘긴다. 아직 못 받았으면 null */
  orders: readonly OrderRowView[] | null;
  /** 남은 선수금 = 이 폼의 상한. 3카드 패널이 받아 부모가 넘긴다 */
  prepaid: number;
  draft: AllocationDraft;
  onDraftChange: (patch: Partial<AllocationDraft>) => void;
  /** 직전 쓰기 뒤 재조회가 실패한 상태. 옛 숫자로 배분하지 않게 잠근다 */
  stale: boolean;
  notice: SettlementNotice | null;
  onRefresh: () => void;
  /** 입금 등록 패널로 돌아간다 */
  onCancel: () => void;
  onDone: (created: AllocationCreated, refreshed: boolean) => void;
}) {
  const create = useCreateAllocationMutation({ onDone });

  const targets = allocationTargets(orders ?? []);
  const allocations = resolveAllocations(
    targets,
    draft.editedAllocations,
    prepaid,
  );
  const total = allocationTotal(allocations);
  const issues = allocationIssues(targets, allocations, prepaid);
  const hasIssue = Object.keys(issues).length > 0;
  const gapText = allocationGapText(prepaid, total);
  const overAllocated = total > prepaid;
  /* 이 요청엔 칸이 없다(소매처·배분 표뿐) — 거절은 전부 버튼 위 한 줄 */
  const formError = create.error ? depositErrorText(create.error) : null;

  const changeAllocation = (orderId: number, raw: string) => {
    if (!targets.some((o) => o.id === orderId)) return;
    if (create.error) create.reset();
    onDraftChange({
      editedAllocations: {
        ...draft.editedAllocations,
        [orderId]: parseNumberInput(raw) ?? 0,
      },
    });
  };

  const busy = create.isPending;
  /** 붙일 돈이 한 건이라도 있고 상한(남은 미수·남은 선수금) 안일 때만. 0원은 보낼 사실이 없다 */
  const canAllocate =
    orders !== null &&
    targets.length > 0 &&
    !hasIssue &&
    total > 0 &&
    !busy &&
    !stale;

  const submit = () => {
    if (!canAllocate) return;
    create.mutate({
      body: toAllocationRequest(retailer.id, allocations),
      idempotencyKey: draft.idempotencyKey,
    });
  };

  return (
    <Panel className="flex-1">
      <Panel.Title sub={retailerLabel(retailer.name, retailer.code)}>
        선수금으로 정산
      </Panel.Title>

      <Panel.Body>
        <Notice className="mb-4">
          새 입금 없이 남은 선수금 {formatNumber(prepaid)}원을 출고된 주문에
          붙여요. 원장은 바뀌지 않아요.
        </Notice>

        <Panel.Section className="mt-0">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h3 className="text-sm">주문별 배분</h3>
            <span className="text-muted-foreground text-xs">
              총 사용 가능{" "}
              <span className="text-primary text-sm font-medium tabular-nums">
                {formatNumber(prepaid)}
              </span>
            </span>
          </div>
          {orders === null ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              좌측에서 거래처를 펼치면 배분할 주문이 보여요
            </p>
          ) : (
            <AllocationTable
              targets={targets}
              values={allocations}
              issues={issues}
              disabled={busy}
              onChange={changeAllocation}
            />
          )}

          {targets.length > 0 ? (
            <>
              <div className="mt-3 flex items-baseline justify-end gap-3 text-sm">
                <span className="text-muted-foreground">남은 선수금</span>
                <span className="text-primary font-medium tabular-nums">
                  {formatNumber(prepaid)}
                </span>
                <span className="text-border-strong">|</span>
                <span className="text-muted-foreground">이번 배분</span>
                <span
                  className={`text-base font-medium tabular-nums ${
                    overAllocated ? "text-destructive-strong" : ""
                  }`}
                >
                  {formatNumber(total)}
                </span>
              </div>
              {gapText ? (
                <p
                  role="status"
                  className={`mt-1 text-right text-xs ${
                    overAllocated
                      ? "text-destructive-strong"
                      : "text-muted-foreground"
                  }`}
                >
                  {gapText}
                </p>
              ) : null}
            </>
          ) : null}
        </Panel.Section>
      </Panel.Body>

      <div className="mt-4 shrink-0">
        {formError ? (
          <p role="alert" className="text-destructive-strong mb-3 text-sm">
            {formError}
          </p>
        ) : stale && notice ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive-strong text-sm">
              {noticeText(notice)}
            </p>
            <Button type="button" variant="line" size="sm" onClick={onRefresh}>
              다시 불러오기
            </Button>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button
            variant="line"
            className="flex-1"
            disabled={busy}
            onClick={onCancel}
          >
            입금 등록으로
          </Button>
          <Button className="flex-1" disabled={!canAllocate} onClick={submit}>
            {busy ? "정산 중…" : "선수금 정산"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
