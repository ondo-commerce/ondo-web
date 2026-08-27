"use client";

import { Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { PackageDetailPanel } from "./PackageDetailPanel";
import { PackageTable } from "./PackageTable";
import { PackingQueueTable } from "./PackingQueueTable";
import { PackingWorkPanel } from "./PackingWorkPanel";
import { ShipmentRetailerTable } from "./ShipmentRetailerTable";
import { ShipmentStageChips } from "./ShipmentStageChips";
import { ShippedTable } from "./ShippedTable";
import { TradeStatementCard } from "./TradeStatementCard";
import { WHOLESALER_NAME } from "../constants";
import {
  groupPackages,
  groupReadyItems,
  matchesKeyword,
  nextPackageNo,
  nextStatementNo,
  packageFromItems,
  packageQty,
  shipPackage,
  stageCounts,
  stamp,
  sumQty,
  statementFromPackage,
} from "../derive";
import type {
  PackingItem,
  Package,
  PackageStatus,
  Retailer,
  ShipmentStage,
} from "../types";
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
 *   출고 대기 → 포장 묶음 표          + 포장 상세 패널
 *   출고 완료 → 출고된 묶음 표        + 장끼 카드
 *
 * 단계와 선택 상태는 URL에 두지 않는다(재고 탭과 같은 규칙).
 *
 * 데이터가 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리
 * (items/packages prop)에서 세 상태를 갈라야 한다.
 */
export function ShipmentListView({
  retailers,
  items: initialItems,
  packages: initialPackages,
}: {
  retailers: readonly Retailer[];
  items: readonly PackingItem[];
  packages: readonly Package[];
}) {
  /*
   * 포장 처리는 서버가 없어서 로컬 상태로 반영한다(재고 탭 입고와 같은 처지).
   * 대기 줄이 줄고 묶음이 느는 것이 한 번에 일어나야 칩 건수가 어긋나지 않는다.
   */
  const [items, setItems] = useState(initialItems);
  const [packages, setPackages] = useState(initialPackages);
  const [stage, setStage] = useState<ShipmentStage>("ready");
  const [query, setQuery] = useState("");
  /** 동시에 하나만 펼친다 — 좌우가 같은 소매처를 가리키게 하려면 기준이 하나여야 한다 */
  const [openRetailerId, setOpenRetailerId] = useState<string | null>(null);
  /** 포장 대기 표에서 체크한 줄. 우측 `포장 작업` 패널이 이 배열을 읽는다 */
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  /** 출고 대기·출고 완료 단계에서 고른 묶음. 두 단계 모두 한 행만 고른다 */
  const [selectedPackageNo, setSelectedPackageNo] = useState<string | null>(
    null,
  );

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

  /** 출고 대기·출고 완료는 상태만 다르고 묶는 방식과 검색 축이 같다 */
  const packageGroupsOf = (status: PackageStatus) =>
    groupPackages(
      retailers,
      packages.filter((pkg) => pkg.status === status),
    ).filter((group) =>
      matchesKeyword(
        group.retailer,
        group.packages.flatMap((pkg) =>
          pkg.lines.map((line) => line.productName),
        ),
        keyword,
      ),
    );

  const selectedPackage =
    packages.find((pkg) => pkg.packageNo === selectedPackageNo) ?? null;
  const selectedPackageRetailer =
    retailers.find((r) => r.id === selectedPackage?.retailerId) ?? null;

  /** 단계를 바꾸면 펼침과 선택이 같이 풀린다. 대기 줄 선택이 출고 대기 화면까지 따라오면 안 된다 */
  const handleStageChange = (next: ShipmentStage) => {
    setStage(next);
    setOpenRetailerId(null);
    setSelectedItemIds([]);
    setSelectedPackageNo(null);
  };

  /** 다른 소매처를 펼치면 선택 초기화 — 한 포장은 한 소매처 것이다 */
  const toggleRetailer = (retailerId: string) => {
    setOpenRetailerId((prev) => (prev === retailerId ? null : retailerId));
    setSelectedItemIds([]);
    setSelectedPackageNo(null);
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

  const restrictTo = (itemIds: string[]) =>
    setSelectedItemIds((prev) => prev.filter((id) => itemIds.includes(id)));

  const selectedItems = items.filter((item) =>
    selectedItemIds.includes(item.id),
  );

  /**
   * 포장 완료. 고른 줄이 대기 목록에서 빠지고 같은 순간 `PKG-NNN` 한 건이 생긴다 —
   * 둘을 따로 처리하면 그 사이에 칩 건수의 합이 맞지 않는 순간이 생긴다.
   */
  const pack = () => {
    const [first] = selectedItems;
    if (!first) return;

    const packageNo = nextPackageNo(packages);
    // 지금 시각은 렌더가 아니라 이 버튼을 누른 순간에만 읽는다
    const packedAt = stamp(new Date());

    setPackages((prev) => [
      ...prev,
      packageFromItems(packageNo, first.retailerId, selectedItems, packedAt),
    ]);
    setItems((prev) =>
      prev.filter((item) => !selectedItemIds.includes(item.id)),
    );
    setSelectedItemIds([]);
  };

  /**
   * 출고 완료. 상태·출고 일시·장끼번호가 한 번에 붙는다.
   * 미수 발생과 재고 차감은 서버 트리거라 여기서 반영하지 않는다(판정 D10) —
   * 대신 확인 다이얼로그가 그 세 가지를 문구로 알린다.
   */
  const ship = () => {
    if (!selectedPackage) return;
    // 오늘 날짜는 렌더가 아니라 확인을 누른 이 순간에만 읽는다
    const shippedAt = stamp(new Date());
    const statementNo = nextStatementNo(shippedAt, packages);

    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.packageNo === selectedPackage.packageNo
          ? shipPackage(pkg, shippedAt, statementNo)
          : pkg,
      ),
    );
    setSelectedPackageNo(null);
  };

  /** 목록이 비었을 때의 문구. 검색 때문인지 원래 없는 건지를 갈라 준다 */
  const emptyList = (blank: string) => (
    /* 빈 목록에는 흐를 것이 없어서 stickyHead 표 대신 Panel.Body를 쓴다 */
    <Panel.Body>
      <p className="text-muted-foreground py-12 text-center text-sm">
        {keyword ? "검색 결과가 없습니다" : blank}
      </p>
    </Panel.Body>
  );

  const listBody = () => {
    if (stage === "ready") {
      if (readyGroups.length === 0) {
        return emptyList("포장 대기 중인 품목이 없습니다");
      }
      return (
        <ShipmentRetailerTable
          countLabel="SKU 건수"
          rows={readyGroups.map(({ retailer, items: rows }) => ({
            retailer,
            count: rows.length,
            qty: sumQty(rows),
          }))}
          openRetailerId={openRetailerId}
          onToggle={toggleRetailer}
          renderDetail={(retailer) => {
            const group = readyGroups.find(
              (g) => g.retailer.id === retailer.id,
            );
            if (!group) return null;
            return (
              <PackingQueueTable
                items={group.items}
                selectedIds={selectedItemIds}
                onToggle={toggleItem}
                onToggleVisible={toggleVisible}
                onRestrictTo={restrictTo}
              />
            );
          }}
        />
      );
    }

    const groups = packageGroupsOf(stage === "packed" ? "PACKED" : "SHIPPED");
    if (groups.length === 0) {
      return emptyList(
        stage === "packed"
          ? "출고 대기 중인 묶음이 없습니다"
          : "출고된 묶음이 없습니다",
      );
    }

    return (
      <ShipmentRetailerTable
        countLabel="포장 건수"
        rows={groups.map(({ retailer, packages: rows }) => ({
          retailer,
          count: rows.length,
          qty: rows.reduce((total, pkg) => total + packageQty(pkg), 0),
        }))}
        openRetailerId={openRetailerId}
        onToggle={toggleRetailer}
        renderDetail={(retailer) => {
          const group = groups.find((g) => g.retailer.id === retailer.id);
          if (!group) return null;
          return stage === "packed" ? (
            <PackageTable
              packages={group.packages}
              selectedPackageNo={selectedPackageNo}
              onSelect={setSelectedPackageNo}
            />
          ) : (
            <ShippedTable
              packages={group.packages}
              selectedPackageNo={selectedPackageNo}
              onSelect={setSelectedPackageNo}
            />
          );
        }}
      />
    );
  };

  const detail = () => {
    if (stage === "ready" && selectedItems.length > 0) {
      return <PackingWorkPanel items={selectedItems} onPack={pack} />;
    }
    if (stage === "packed" && selectedPackage && selectedPackageRetailer) {
      return (
        <PackageDetailPanel
          key={selectedPackage.packageNo}
          pkg={selectedPackage}
          retailer={selectedPackageRetailer}
          onShip={ship}
        />
      );
    }
    if (stage === "shipped" && selectedPackage && selectedPackageRetailer) {
      const statement = statementFromPackage(
        selectedPackage,
        selectedPackageRetailer,
        WHOLESALER_NAME,
      );
      /* 장끼번호는 출고 완료 시점에 붙는다. 없으면 카드를 그리지 않는다 */
      if (statement) return <TradeStatementCard statement={statement} />;
    }
    return undefined;
  };

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 두 줄 — 첫 줄은 검색(과 주 액션), 둘째 줄은 필터.
              한 줄로 두면 검색창 340px + 세그먼트들이 좌측 패널 폭을 넘겨서 제멋대로 접힌다.
              검색은 폭이 고정이고 필터는 칸 수·글자 길이에 따라 변하니, 변하는 쪽만 아래 줄에
              모아 두면 검색창 자리가 탭을 옮겨도 흔들리지 않는다.
              첫 줄의 `mr-auto`는 오른쪽에 주 액션이 붙는 탭(상품·정산)과 규칙을 맞추려는 것이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-3 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="거래처·품명 검색"
              aria-label="거래처·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <ShipmentStageChips
              counts={counts}
              value={stage}
              onChange={handleStageChange}
            />
          </div>

          {/* 검색줄·칩 줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
              stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다
              (빈 목록일 때만 emptyList가 Panel.Body를 쓴다) */}
          {listBody()}
        </Panel>
      }
      detail={detail()}
      emptyDetail={EMPTY_DETAIL[stage]}
    />
  );
}
