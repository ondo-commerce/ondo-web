"use client";

import { AccordionRows, Panel, SearchInput, cn } from "@ondo/ui";
import { useState } from "react";
import { BackorderSkuRow } from "./BackorderSkuRow";
import { SKU_GRID } from "../constants";
import type { BackorderSku } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 목록의 표 머리. `AccordionRow`의 버튼 안쪽 구조(좌우 px-4 · gap-1.5 · 화살표 size-5)를
 * 그대로 흉내 내야 아래 행들과 열이 맞는다 — 그래서 화살표 자리를 **빈 칸으로 남긴다**.
 * 여백값을 손으로 계산해 박지 않는 이유이기도 하다(같은 클래스를 쓰면 같이 움직인다).
 */
function ListHeader() {
  return (
    <div className="border-border text-muted-foreground flex items-center gap-1.5 border-b px-4 py-2 text-body">
      <span className="size-5 shrink-0" aria-hidden />
      <span className={cn(SKU_GRID, "min-w-0 flex-1")}>
        <span>SKU</span>
        <span>상품명</span>
        <span className="text-center">색상</span>
        <span className="text-center">사이즈</span>
        <span className="text-right">총 미송 수량</span>
        <span className="text-right">예상 입고일</span>
      </span>
    </div>
  );
}

/**
 * 미송 관리 — 좌 목록(미송이 걸린 SKU) + 우 작업 패널.
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리(skus prop)에서
 * 세 상태를 갈라야 한다.
 *
 * 선택(펼침) 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 */
export function BackorderListView({ skus }: { skus: BackorderSku[] }) {
  const [query, setQuery] = useState("");
  /**
   * **한 번에 하나만 펼친다.** 우측 요약이 "펼친 SKU 1개"에 종속돼 있어서
   * 둘이 열리면 어느 쪽 요약인지 알 수 없다.
   */
  const [openSkuId, setOpenSkuId] = useState<string | null>(null);

  const keyword = query.trim().toLowerCase();
  const visibleSkus = keyword
    ? skus.filter(
        (sku) =>
          sku.productName.toLowerCase().includes(keyword) ||
          sku.id.toLowerCase().includes(keyword),
      )
    : skus;

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <Panel.Title>미송 관리</Panel.Title>
          <div className="mb-4 shrink-0">
            <SearchInput
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 검색줄과 제목은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
              폭이 모자라면 표 머리와 행이 **같이** 가로로 흐르도록 여기서 한 번만 받는다.
              열마다 스크롤이 따로 생기면 머리와 값이 어긋난다 */}
          <Panel.Body className="overflow-x-auto">
            {visibleSkus.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            ) : (
              <div className="min-w-max">
                <ListHeader />
                <AccordionRows>
                  {visibleSkus.map((sku) => (
                    <BackorderSkuRow
                      key={sku.id}
                      sku={sku}
                      open={openSkuId === sku.id}
                      onOpenChange={(open) =>
                        setOpenSkuId(open ? sku.id : null)
                      }
                    />
                  ))}
                </AccordionRows>
              </div>
            )}
          </Panel.Body>
        </Panel>
      }
      emptyDetail="좌측에서 미송 SKU를 펼치세요"
    />
  );
}
