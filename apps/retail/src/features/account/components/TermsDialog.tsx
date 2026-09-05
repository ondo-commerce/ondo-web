"use client";

import { Button, Dialog } from "@ondo/ui";
import type { ReactNode } from "react";
import { SIGNUP_TERMS } from "../constants";
import type { TermsKind } from "../types";
import { useReturnFocus } from "../useReturnFocus";

/**
 * 약관 전문 모달. 회원가입 체크 줄과 설정 동의 내역이 **같은 것을 띄운다**.
 *
 * 전문을 별도 화면(`/terms`)이 아니라 모달로 두는 이유: 주소가 바뀌면 가입 폼에
 * 채운 칸도, 설정에서 고치던 상호명·연락처도 전부 날아간다. 읽고 닫으면 채우던
 * 자리로 그대로 돌아온다.
 *
 * `TermsCheck` 안에 있던 것을 여기로 꺼냈다 — 사용처가 둘이 되는 순간이라
 * (Rule of Two) 문안이 두 벌로 갈리기 전에 하나로 모은다.
 */
export function TermsDialog({
  kind,
  trigger,
}: {
  kind: TermsKind;
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
          읽고 닫으면 보던 자리로 그대로 돌아와요.
        </Dialog.Description>
        {/* 전문이 길어도 모달이 화면 밖으로 자라지 않게 여기서만 흐른다 */}
        <div className="scroll-slim mt-4 max-h-80 space-y-3 overflow-y-auto pr-1 text-body">
          {terms.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line">닫기</Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
