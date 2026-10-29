"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 등록·수정 폼의 `취소` 확인(D22). 입력이 있거나 사진이 올라가는 중일 때만 뜬다 —
 * 조건은 부르는 쪽이 `onOpenChange`에서 `isProductFormDirty(...) || uploading`으로 정하고
 * (아니면 열지 않고 바로 떠난다), 여기는 껍데기와 문구뿐이다. 구조는
 * `order/OrderConfirmDialog`를 복제했다(feature 간 import 금지).
 *
 * `취소` 버튼이 **`Dialog.Trigger`**로 들어온다(`children`). radix Dialog 는 닫힐 때 열 때의
 * 포커스가 아니라 **트리거**로 돌려보내는데, 트리거 없이 상태로만 열면 돌아갈 곳이 없어
 * 포커스가 body 로 떨어졌다(e2e S3-14 첫 실행). 트리거로 두면 `취소`로 돌아온다.
 *
 * 열릴 때 포커스는 **`계속 작성`** — Enter 를 눌러 버릇한 손이 입력을 날리면 안 된다.
 * radix 는 안의 첫 탭 대상에 포커스를 주므로 `계속 작성`이 DOM 에서 먼저다.
 * `나가기`는 빨강이 아니다 — 되돌릴 수 없는 건 삭제뿐이고, 이건 아직 저장하지 않은 것을
 * 버리는 일이다.
 */
export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onLeave,
  children,
}: {
  open: boolean;
  /** 트리거(`취소`)를 누르면 `true`로 불린다 — 더티가 아니면 여기서 열지 말고 떠난다 */
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
  /** 트리거가 될 `취소` 버튼. 포털로 뜨는 내용과 달리 이건 있던 자리에 그려진다 */
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Content data-ac="S3-11 S3-14">
        <Dialog.Title>작성 중인 내용이 사라져요. 나갈까요?</Dialog.Title>
        <Dialog.Description>
          저장하지 않은 입력과 올리는 중인 사진은 남지 않아요.
        </Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">계속 작성</Button>
          </Dialog.Close>
          <Button onClick={onLeave}>나가기</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
