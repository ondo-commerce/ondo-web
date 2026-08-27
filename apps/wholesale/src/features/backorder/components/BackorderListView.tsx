"use client";

import { Button, Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { AllocationCounterBar } from "./AllocationCounterBar";
import { BackorderAllocationTable } from "./BackorderAllocationTable";
import { BackorderTable } from "./BackorderTable";
import { BackorderSummaryCard } from "./BackorderSummaryCard";
import { EtaFormCard } from "./EtaFormCard";
import {
  allocatedQty,
  applyAllocation,
  assignableQty,
  firstComeAllocation,
  sortByOrderedAt,
  summarize,
  totalBackorderQty,
  unallocatedQty,
  withAllocation,
} from "../derive";
import type { AllocationDraft, BackorderSku } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 미송 관리 — 좌 목록(미송이 걸린 SKU) + 우 작업 패널.
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리(skus prop)에서
 * 세 상태를 갈라야 한다.
 *
 * 선택(펼침) 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 */
export function BackorderListView({
  skus: initialSkus,
}: {
  skus: BackorderSku[];
}) {
  /*
   * 배분 확정은 서버가 없어서 로컬 상태로 반영한다. 그래서 목록을 prop 그대로 그리지 않고
   * state로 들고 있는다 — 확정하면 총 미송 수량과 가용재고가 같이 움직여야 한다.
   * (재고 탭 InventoryListView의 receive()와 같은 방식)
   */
  const [skus, setSkus] = useState(initialSkus);
  const [query, setQuery] = useState("");
  /**
   * **한 번에 하나만 펼친다.** 우측 요약이 "펼친 SKU 1개"에 종속돼 있어서
   * 둘이 열리면 어느 쪽 요약인지 알 수 없다.
   */
  const [openSkuId, setOpenSkuId] = useState<string | null>(null);
  /**
   * 배분 수량 입력. 펼친 SKU 하나의 것만 들고 있는다 — 아코디언이 하나만 열리므로
   * 여러 SKU의 입력이 동시에 살아 있을 일이 없고, 남겨 두면 다른 SKU를 펼쳤을 때
   * 남의 입력이 카운터에 섞인다.
   */
  const [draft, setDraft] = useState<AllocationDraft>({});

  /** 펼칠 때 배분 수량을 선착순으로 자동으로 채운다. 접으면 입력을 버린다 */
  const toggleSku = (sku: BackorderSku) => {
    const next = openSkuId === sku.id ? null : sku;
    setOpenSkuId(next?.id ?? null);
    setDraft(next ? firstComeAllocation(next.lines, assignableQty(next)) : {});
  };

  /**
   * 배분 확정. 계산은 `applyAllocation`이 다 하고 여기서는 state만 갈아끼운다.
   *
   * 미송이 0이 된 SKU는 목록에서 지운다 — 미송이 없으면 미송 탭에 남아 있을 이유가 없고,
   * 0행을 남기면 목록이 계속 길어지기만 한다. 그 SKU를 지울 때 아코디언도 같이 닫는다.
   * 남는 경우에는 줄어든 가용재고 기준으로 배분 수량을 선착순으로 다시 채운다.
   */
  const confirmAllocation = (sku: BackorderSku) => {
    const next = applyAllocation(sku, draft);
    const cleared = next.lines.length === 0;

    setSkus((prev) =>
      cleared
        ? prev.filter((s) => s.id !== sku.id)
        : prev.map((s) => (s.id === sku.id ? next : s)),
    );

    if (cleared) setOpenSkuId(null);
    setDraft(
      cleared ? {} : firstComeAllocation(next.lines, assignableQty(next)),
    );
  };

  /** 예상 입고일 등록. 저장하면 좌측 목록과 요약이 같은 값을 보게 된다 */
  const saveEta = (skuId: string, eta: string) =>
    setSkus((prev) => prev.map((s) => (s.id === skuId ? { ...s, eta } : s)));

  const keyword = query.trim().toLowerCase();
  const visibleSkus = keyword
    ? skus.filter(
        (sku) =>
          sku.productName.toLowerCase().includes(keyword) ||
          sku.id.toLowerCase().includes(keyword),
      )
    : skus;

  /* 우측 두 카드는 **펼친 SKU 1개**에 종속된다. 검색으로 가려진 SKU라도 펼쳐져 있으면
     그 값이 보여야 하므로 visibleSkus가 아니라 skus에서 찾는다 */
  const openSku = skus.find((sku) => sku.id === openSkuId) ?? null;

  /**
   * 펼친 SKU의 본문. 카운터 3개는 **여기서 한 번만 계산해** 카운터 바와 표에 나눠 준다 —
   * 두 컴포넌트가 각자 세면 합이 어긋날 수 있고, 어긋나는 순간 사장이 화면을 안 믿는다.
   */
  const allocationBody = (sku: BackorderSku) => {
    const lines = sortByOrderedAt(sku.lines);
    const assignable = assignableQty(sku);
    const allocated = allocatedQty(draft);

    return (
      <>
        <AllocationCounterBar
          unallocated={unallocatedQty(totalBackorderQty(lines), allocated)}
          assignable={assignable}
          allocated={allocated}
        />
        <BackorderAllocationTable
          lines={lines}
          draft={draft}
          onChange={(lineId, next) =>
            setDraft((prev) =>
              withAllocation(prev, lines, assignable, lineId, next),
            )
          }
        />

        {/* 확인 다이얼로그는 없다 — Figma에 그려져 있지 않다. 대신 배분이 0이면 눌리지 않는다 */}
        <div className="mt-4 mb-2 flex justify-end">
          <Button
            disabled={allocated === 0}
            onClick={() => confirmAllocation(sku)}
          >
            배분 확정
          </Button>
        </div>
      </>
    );
  };

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 한 줄 — 좌: 검색 / 우: 필터와 주 액션.
              검색창의 `mr-auto`가 나머지를 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(필터·버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-4 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.

              이 표는 `Panel.Body`를 쓰지 않는다. 머리글을 sticky로 고정하려면 표 자신이
              세로 스크롤을 받아야 하는데(Table의 stickyHead 주석 참고), Panel.Body가 밖에서
              또 스크롤을 받으면 막대가 두 개 생긴다. 빈 목록일 때는 흐를 것이 없어서
              그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
          {visibleSkus.length === 0 ? (
            <Panel.Body>
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            </Panel.Body>
          ) : (
            <BackorderTable
              skus={visibleSkus}
              openSkuId={openSkuId}
              onToggle={toggleSku}
              renderDetail={allocationBody}
            />
          )}
        </Panel>
      }
      detail={
        openSku ? (
          <>
            <BackorderSummaryCard summary={summarize(openSku)} />
            {/* key: 다른 SKU로 바뀌면 입력 중이던 날짜·사유가 남지 않게 상태째 새로 만든다 */}
            <EtaFormCard
              key={openSku.id}
              initialEta={openSku.eta}
              onSave={(eta) => saveEta(openSku.id, eta)}
            />
          </>
        ) : undefined
      }
      emptyDetail="좌측에서 미송 SKU를 펼치세요"
    />
  );
}
