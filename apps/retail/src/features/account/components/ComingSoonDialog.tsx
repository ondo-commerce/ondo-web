"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";

/**
 * 아직 화면이 없는 목적지를 누르면 뜨는 안내.
 *
 * 왜 `href="#"`로 두지 않는가: 확정 와이어프레임의 `비밀번호 찾기`·`문의하기`는
 * 목적지가 비어 있는데, 그대로 옮기면 **눌러도 아무 일도 일어나지 않는 링크**가
 * 된다(직전 회차 결함 F2). 라우트를 새로 파는 건 이번 회차 범위 밖이라
 * (`01-pm.md` Q4) "지금은 없다"를 화면이 말하게 한다.
 */
export function ComingSoonDialog({
  trigger,
  title,
  description,
}: {
  /** 누르는 것. `asChild`로 넘어가므로 하나의 실제 버튼이어야 한다 */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
}) {
  return (
    <Dialog>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">닫기</Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/**
 * 링크처럼 보이는 버튼. 목적지가 없으므로 `<a>`가 아니라 `<button>`이다 —
 * 주소가 없는 `<a href="#">`는 새 탭·주소 복사가 전부 거짓말이 된다.
 */
export function LinkButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="text-foreground cursor-pointer underline-offset-4 hover:underline"
      {...props}
    >
      {children}
    </button>
  );
}
