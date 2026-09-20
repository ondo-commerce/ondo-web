import { formatWon, type ProductBlock } from "../derive";

/**
 * 주문 상품 한 덩어리(`.line-item`) — 썸네일 · 상품명 · 옵션 한 줄 · 소계.
 *
 * **수량 입력칸도 삭제 버튼도 옵션 드롭다운도 없다**(RT-37). 주문서는 고칠 수
 * 없는 명세라 여기서 바꿀 수 있는 것이 하나도 없어야 하고, 고치는 길은
 * 상자 아래 안내가 `장바구니로 돌아가세요`로 알려 준다.
 *
 * 주문서와 주문 완료 두 화면이 같은 모양을 쓴다 — 접수 전후로 명세가 달라
 * 보이면 사장이 무엇이 접수됐는지 다시 대조해야 한다.
 */
export function OrderLineItem({ block }: { block: ProductBlock }) {
  return (
    <li className="border-border flex items-center gap-3 border-b py-3 last:border-b-0">
      {/* 이미지가 아직 없다. 자리만 잡아 두고 낭독기에는 읽히지 않게 둔다 */}
      <span aria-hidden className="bg-secondary size-13 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{block.productName}</p>
        <p className="text-muted-foreground text-body mt-0.5">
          {block.options}
        </p>
      </div>
      <span className="w-24 shrink-0 text-right font-medium tabular-nums">
        {formatWon(block.amount)}
      </span>
    </li>
  );
}
