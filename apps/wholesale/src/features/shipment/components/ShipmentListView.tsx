"use client";

import { AccordionRows, Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { PackingQueueTable } from "./PackingQueueTable";
import { RetailerAccordionRow } from "./RetailerAccordionRow";
import { ShipmentStageChips } from "./ShipmentStageChips";
import { STAGE_LABEL } from "../constants";
import {
  groupReadyItems,
  matchesKeyword,
  readySummaryLabel,
  stageCounts,
} from "../derive";
import type { PackingItem, Package, Retailer, ShipmentStage } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 선택 전 우측 안내. 단계마다 무엇을 고르라는 말이 달라서 한 문구로 못 쓴다 */
const EMPTY_DETAIL: Record<ShipmentStage, string> = {
  ready: "좌측 목록에서 포장할 품목을 선택하세요",
  packed: "좌측 목록에서 포장을 선택하세요",
  shipped: "좌측 목록에서 출고 건을 선택하세요",
};

/**
 * 출고 관리 — 좌 목록(소매처 아코디언) + 우 작업 패널.
 *
 * **세 단계는 다른 페이지가 아니라 한 화면의 상태다**(판정 D1). 좌측 셸은 그대로 두고
 * 칩으로 아래 셋만 바꾼다:
 *
 *   포장 대기 → 대기 줄 표(체크박스) + 포장 작업 패널
 *   포장 완료 → 포장 묶음 표          + 포장 상세 패널
 *   출고 완료 → 출고된 묶음 표        + 장끼 카드
 *
 * 단계와 선택 상태는 URL에 두지 않는다(재고 탭과 같은 규칙).
 *
 * 데이터가 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리
 * (items/packages prop)에서 세 상태를 갈라야 한다.
 */
export function ShipmentListView({
  retailers,
  items,
  packages,
}: {
  retailers: readonly Retailer[];
  items: readonly PackingItem[];
  packages: readonly Package[];
}) {
  const [stage, setStage] = useState<ShipmentStage>("ready");
  const [query, setQuery] = useState("");
  /** 동시에 하나만 펼친다 — 좌우가 같은 소매처를 가리키게 하려면 기준이 하나여야 한다 */
  const [openRetailerId, setOpenRetailerId] = useState<string | null>(null);
  /** 포장 대기 표에서 체크한 줄. 우측 `포장 작업` 패널이 이 배열을 읽는다 */
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const counts = stageCounts(items, packages);
  const keyword = query.trim();

  /* 검색은 소매처명·소매처코드·그 소매처가 가진 상품명 세 축이다(판정 D9) */
  const readyGroups = groupReadyItems(retailers, items).filter((group) =>
    matchesKeyword(
      group.retailer,
      group.items.map((item) => item.productName),
      keyword,
    ),
  );

  /** 단계를 바꾸면 펼침과 선택이 같이 풀린다. 대기 줄 선택이 포장 완료 화면까지 따라오면 안 된다 */
  const handleStageChange = (next: ShipmentStage) => {
    setStage(next);
    setOpenRetailerId(null);
    setSelectedItemIds([]);
  };

  /** 다른 소매처를 펼치면 선택 초기화 — 한 포장은 한 소매처 것이다 */
  const handleOpenChange = (retailerId: string, open: boolean) => {
    setOpenRetailerId(open ? retailerId : null);
    setSelectedItemIds([]);
  };

  const toggleItem = (itemId: string) =>
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );

  const toggleVisible = (itemIds: string[], checked: boolean) =>
    setSelectedItemIds((prev) =>
      checked
        ? [...new Set([...prev, ...itemIds])]
        : prev.filter((id) => !itemIds.includes(id)),
    );

  const listBody = () => {
    if (stage !== "ready") {
      /* 포장 완료·출고 완료 목록은 다음 이슈에서 채운다. 칩 건수는 이미 맞다 */
      return (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {STAGE_LABEL[stage]} 목록은 준비 중입니다
        </p>
      );
    }

    if (readyGroups.length === 0) {
      return (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {keyword ? "검색 결과가 없습니다" : "포장 대기 중인 품목이 없습니다"}
        </p>
      );
    }

    return (
      <AccordionRows>
        {readyGroups.map(({ retailer, items: rows }) => (
          <RetailerAccordionRow
            key={retailer.id}
            retailer={retailer}
            summary={readySummaryLabel(rows)}
            open={openRetailerId === retailer.id}
            onOpenChange={(open) => handleOpenChange(retailer.id, open)}
          >
            <PackingQueueTable
              items={rows}
              selectedIds={selectedItemIds}
              onToggle={toggleItem}
              onToggleVisible={toggleVisible}
            />
          </RetailerAccordionRow>
        ))}
      </AccordionRows>
    );
  };

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <Panel.Title>출고 관리</Panel.Title>
          <div className="mb-3 shrink-0">
            <SearchInput
              placeholder="거래처·품명 검색"
              aria-label="거래처·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mb-4 shrink-0">
            <ShipmentStageChips
              counts={counts}
              value={stage}
              onChange={handleStageChange}
            />
          </div>

          {/* 제목·검색줄·칩 줄은 Panel.Body 밖이라 목록만 흐른다 — 화면 전체 스크롤 없음 */}
          <Panel.Body>{listBody()}</Panel.Body>
        </Panel>
      }
      emptyDetail={EMPTY_DETAIL[stage]}
    />
  );
}
