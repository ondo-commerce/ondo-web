"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { canPack, hasMixedPickup, sumQty } from "../derive";
import type { PackingItem } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 `포장 작업` 패널. 좌측 표에서 체크한 줄이 그대로 하나의 `PKG`가 된다.
 *
 * 포장 단위는 주문이 아니라 **소매처 × 선택 품목**이다(§2.7) — 한 주문이 여러 포장으로
 * 쪼개지고 여러 주문이 한 포장으로 합쳐진다. 그래서 여기 목록에 주문코드가 없다.
 *
 * 수령 방식이 섞이면 버튼만 막고 선택은 그대로 둔다(게이트 Q3). 무엇을 빼야 하는지
 * 보려면 섞인 상태가 화면에 남아 있어야 한다.
 */
export function PackingWorkPanel({
  items,
  onPack,
}: {
  /** 체크된 줄. 비어 있으면 이 패널은 아예 그리지 않는다 */
  items: readonly PackingItem[];
  onPack: () => void;
}) {
  const mixed = hasMixedPickup(items);

  return (
    <Panel className="flex-1">
      <Panel.Title sub="대기열에서 선택한 품목을 묶어 포장합니다">
        포장 작업
      </Panel.Title>

      <Panel.Body>
        <Panel.Section title={`총 ${items.length}개 상품`}>
          <ul className="flex flex-col gap-2.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  {item.productName}{" "}
                  <span className="text-muted-foreground">
                    ({item.skuCode})
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatNumber(item.qty)}개
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
            {formatNumber(sumQty(items))}개
          </span>
        </div>

        {mixed ? (
          <Notice className="mt-4">
            직접 수령과 사입삼촌은 한 포장으로 묶을 수 없습니다. 한 가지 수령
            방식만 남겨 주세요.
          </Notice>
        ) : null}

        <Button
          size="lg"
          className="mt-4"
          disabled={!canPack(items)}
          onClick={onPack}
        >
          포장 완료
        </Button>
      </div>
    </Panel>
  );
}
