"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";
import { SIGNUP_TERMS } from "../fixtures";
import { useReturnFocus } from "../useReturnFocus";

/**
 * 약관 전문 다이얼로그. 별도 화면(`/terms`)이 아닌 이유: 주소가 바뀌면 가입 폼에
 * 채운 11칸이 전부 날아간다.
 *
 * ⚠️ 안에 `<form>`을 두지 않는다. 다이얼로그 안의 `<form onSubmit>`은
 *    `stopPropagation` 없이는 **부모 폼(가입 폼)까지 제출한다** — Radix Portal은
 *    body 직속이지만 React 합성 이벤트는 부모 트리로 버블한다
 *    (`retail-settings` F2). 여기는 닫기 버튼 하나뿐이라 그 자리가 아예 없다.
 */
export function TermsDialog({
  kind,
  trigger,
}: {
  kind: "service" | "privacy";
  /** 누르는 것. `asChild`로 넘어가므로 하나의 실제 버튼이어야 한다 */
  trigger: ReactNode;
}) {
  const terms = SIGNUP_TERMS[kind];
  const focus = useReturnFocus();

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) focus.remember();
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Content onCloseAutoFocus={focus.restore}>
        <Dialog.Title>{terms.label}</Dialog.Title>
        <Dialog.Description>
          읽고 닫으면 채우던 자리로 그대로 돌아와요. 적은 값은 사라지지 않아요.
        </Dialog.Description>
        {/* 전문이 길어도 모달이 화면 밖으로 자라지 않게 여기서만 흐른다 */}
        <div className="scroll-slim text-body mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
          {terms.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Dialog.Footer>
          <Dialog.Close asChild>
            {/* `Button`에 type 기본값이 없다 — 폼 안이면 submit이 된다 */}
            <Button type="button" variant="line">
              닫기
            </Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
