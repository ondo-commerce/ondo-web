"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { FOCUS_RING_CLASS } from "../constants";

/**
 * 아직 화면이 없는 목적지를 누르면 뜨는 안내. `href="#"`로 두면 **눌러도 아무 일도
 * 일어나지 않는 링크**가 되고, 라우트를 새로 파는 건 범위 밖이라(메일 발송 경로가
 * 없다) 다음에 할 일을 화면이 말하게 한다.
 *
 * 본문은 "준비 중이에요"로 끝내지 않고 문의처(`CONTACT_LINE`)를 준다 — 막다른
 * 안내는 눌러 본 사람에게 다음 걸음을 주지 않는다(`side-02` N7).
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
        {/* 문의 한 줄(S1-3)이 서는 자리. e2e와 공개 스모크가 이 표시로 찾는다 */}
        <Dialog.Description data-ac="S1-3">{description}</Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            {/* `Button`에 type 기본값이 없다 — 폼 안에 들어가면 submit이 된다 */}
            <Button type="button" variant="line">
              닫기
            </Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/**
 * 링크처럼 보이는 버튼. 주소가 없는 `<a href="#">`는 새 탭·주소 복사가 전부
 * 거짓말이 되므로 `<button>`이다.
 */
export function LinkButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`text-foreground cursor-pointer underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
      {...props}
    >
      {children}
    </button>
  );
}
