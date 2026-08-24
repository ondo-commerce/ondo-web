"use client";

import { Button, Dialog } from "@ondo/ui";
import { formatNumber } from "@/shared/lib/format";

/**
 * 출고 완료 확인. **출고는 되돌릴 수 없다** — 미수 발생 · 재고 차감 · 장끼 발번
 * 세 가지가 한 번에 걸리는 두 축의 분기점이고(glossary §4.4), `package.status`에
 * `PACKED`로 되돌아가는 전이가 없다. 그래서 한 번 막는다(재고 탭 입고 선례).
 *
 * `packages/ui`의 `Dialog`를 그대로 쓴다. 여기 있는 건 무엇이 나가는지를 채우는
 * 껍데기뿐이다 — 재고 탭의 `InboundConfirmDialog`를 import 하지 않는 이유는
 * feature 경계를 넘고 문구가 다르기 때문이다.
 */
export function ShipConfirmDialog({
  open,
  onOpenChange,
  packageNo,
  totalQty,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageNo: string;
  totalQty: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Title>출고 완료 확인</Dialog.Title>
        <Dialog.Description asChild>
          <div>
            <b className="text-foreground">{packageNo}</b> · 총{" "}
            <b className="text-foreground">{formatNumber(totalQty)}개</b>를 출고
            처리합니다.
            <br />
            처리하면 미수가 발생하고 재고가 차감되며 장끼가 발행됩니다.
            <br />
            <b className="text-foreground">되돌릴 수 없습니다.</b>
          </div>
        </Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">취소</Button>
          </Dialog.Close>
          <Button onClick={onConfirm}>출고 완료</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
