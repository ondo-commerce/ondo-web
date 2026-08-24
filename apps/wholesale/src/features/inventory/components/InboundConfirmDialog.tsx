"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 입고 처리 확인. **모드 A와 모드 B가 같은 다이얼로그를 쓴다**(§7 Q6) —
 * 입고는 평균원가를 바꾸는 되돌리기 어려운 작업이라 한 번 막는다.
 *
 * packages/ui의 Dialog를 그대로 쓰고 새 컴포넌트를 만들지 않는다. 여기 있는 건
 * "무엇을 몇 개 넣는가"를 채우는 껍데기뿐이고, 문구는 부르는 쪽이 넘긴다.
 */
export function InboundConfirmDialog({
  open,
  onOpenChange,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 확인해야 할 값. 모드 A는 줄 수와 총 수량, 모드 B는 현재고 → 변동 후 재고 */
  description: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Title>입고 처리 확인</Dialog.Title>
        <Dialog.Description asChild>
          <div>{description}</div>
        </Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">취소</Button>
          </Dialog.Close>
          <Button onClick={onConfirm}>입고 처리</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
