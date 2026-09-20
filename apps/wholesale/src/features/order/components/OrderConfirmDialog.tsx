"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 주문 확정·취소 확인.
 *
 * **Figma에 없는 화면이다.** 그래도 두는 이유는 둘 다 되돌릴 수 없기 때문이다 —
 * 확정은 미입력 잔량을 미송으로 못박고, 취소는 주문 자체를 끝낸다.
 * 재고 탭이 같은 이유로 `InboundConfirmDialog`를 쓰고 있어 그 구조를 그대로 따랐다.
 *
 * 문구는 부르는 쪽이 넘긴다. 여기 있는 건 껍데기뿐이다.
 */
export function OrderConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 확인해야 할 값. 확정은 미송으로 넘어가는 수량, 취소는 되돌릴 수 없다는 사실 */
  description: ReactNode;
  confirmLabel: string;
  /** 빨강은 마지막 확인 한 곳에만 쓴다 — 주문 취소가 그 자리다 */
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description asChild>
          <div>{description}</div>
        </Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">닫기</Button>
          </Dialog.Close>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
