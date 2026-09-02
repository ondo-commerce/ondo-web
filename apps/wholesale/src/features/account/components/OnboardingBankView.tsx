"use client";

import { Button, Dialog, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceArrival } from "../arrival";
import {
  ACCOUNT_PATH,
  ARRIVAL_MESSAGE,
  BANK_CONFIRM,
  SESSION_REQUIRED_LEAD,
} from "../constants";
import { saveBankAccount, skipBankPrompt } from "../store";
import type { BankAccount } from "../types";
import { useReturnFocus } from "../useReturnFocus";
import { AccountGateNotice, useAccountGate } from "./AccountGate";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { BankAccountForm } from "./BankAccountForm";
import { SummaryList } from "./SummaryList";
import { WarnNotice } from "./WarnNotice";

/**
 * 최초 로그인 정산 계좌 온보딩. **등록한 계좌를 고치는 자리이기도 하다.**
 *
 * 이 값이 **소매 화면의 「입금 계좌 안내」로 그대로 나간다** — 소매 사장은 그걸
 * 보고 자기 은행 앱에서 송금한다. 정산 탭은 **한 파일도 건드리지 않는다**: 그쪽에
 * 계좌 관리와 선수금이 동시에 들어오고 있어 한가운데를 건드리면 충돌만 만든다.
 *
 * **건너뛸 수 있다.** 계좌와 무관한 업무까지 멈추지 않게 — 자세한 이유는
 * `store.skipBankPrompt`.
 *
 * 화면이 두 얼굴을 갖는 이유(`wholesale-account` F8): 등록하고 나면 계정 메뉴의
 * 계좌 줄이 읽기 전용이 되어 **한 자 틀린 번호를 고칠 길이 없었다.** 계좌가 있으면
 * 기존 값이 채워진 수정 폼, 없으면 빈 등록 폼이다. 저장 **직전 확인 단계**는 둘 다
 * 거친다.
 */
export function OnboardingBankView() {
  const router = useRouter();
  /* **승인된 계정만** 계좌를 낸다 — 소매 화면에 상품이 뜨지 않는 도매처의 계좌는
     쓸 자리가 없다. 상태를 안 보면 주소만 알아도 열렸다(`wholesale-account` F11) */
  const gate = useAccountGate("APPROVED");
  const focus = useReturnFocus();
  /** 확인 단계에 올려 둔 계좌. `null`이면 아직 확인 차례가 아니다 */
  const [pending, setPending] = useState<BankAccount | null>(null);

  /* 훅을 전부 부른 **뒤에** 가른다 — 훅 호출 순서는 렌더마다 같아야 한다.
     세션이 없으면 폼 자체를 내주지 않는다: 예전에는 3칸을 다 채우고 버튼까지
     눌렸는데 아무것도 저장되지 않고 `/login`으로 떨어졌다(`wholesale-account` F2) */
  if (!gate.pass) {
    return (
      <AccountGateNotice
        blocked={gate.blocked}
        lead={SESSION_REQUIRED_LEAD.bankOnboarding}
      />
    );
  }

  const email = gate.session.account.email;
  /** 이미 등록한 계좌. 있으면 이 화면은 수정 화면이다 */
  const current = gate.session.account.bankAccount;

  /* `replace`다 — 뒤로 가기로 돌아오면 이미 낸 계좌를 또 내라는 화면이 뜬다 */
  const leave = (message: string) => {
    announceArrival(ACCOUNT_PATH.erpHome, message);
    router.replace(ACCOUNT_PATH.erpHome);
  };

  /** 확인 단계에서 `등록`을 누른 순간. 저장이 먼저고 이동이 나중이다 */
  const confirm = () => {
    if (!pending) return;
    saveBankAccount(email, pending);
    setPending(null);
    leave(current ? ARRIVAL_MESSAGE.bankUpdated : ARRIVAL_MESSAGE.bankSaved);
  };

  /** 계좌를 남기지 않고 나간다. 최초 등록일 때만 "봤다"고 표시한다 */
  const skip = () => {
    if (!current) skipBankPrompt(email);
    leave(current ? ARRIVAL_MESSAGE.bankKept : ARRIVAL_MESSAGE.bankSkipped);
  };

  return (
    <>
      <AuthPanel
        title={
          current ? "정산 계좌를 고쳐 주세요" : "정산 계좌를 등록해 주세요"
        }
        lead={
          current
            ? "지금 등록된 계좌를 채워 뒀어요. 고칠 곳만 바꾸고 저장하면 돼요."
            : "소매 사장님이 이 계좌를 보고 입금해요. 등록 전에는 소매 화면에 계좌가 비어 있어요."
        }
      >
        <AuthSection>
          <BankAccountForm
            initial={current ?? undefined}
            onSubmit={(account) => {
              /* 저장하지 않는다 — 확인 단계로 올린다 */
              focus.remember();
              setPending(account);
            }}
            actions={
              <>
                <AuthSection>
                  <Notice>
                    <span className="flex items-start gap-2">
                      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>
                        계좌는 소매 사장님 화면의 「입금 계좌 안내」에 그대로
                        보여요. 예금주가 다르면 송금이 반송돼요.
                      </span>
                    </span>
                  </Notice>
                </AuthSection>

                <AuthSection className="space-y-2">
                  {/* 잠그지 않는다. 못 채운 칸이 있어도 눌리고, 누르면 그 칸으로 간다 */}
                  <Button type="submit" size="lg" className="w-full">
                    {current ? "이 계좌로 바꾸기" : "등록하고 시작하기"}
                  </Button>
                  {/* 건너뛰기를 숨기지 않는다 — 찾아야 하는 탈출구는 탈출구가 아니다 */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={skip}
                  >
                    {current ? "그만두기" : "나중에 입력하기"}
                  </Button>
                </AuthSection>
              </>
            }
          />
        </AuthSection>
      </AuthPanel>

      {/* 폼 **밖**에 둔다 — 다이얼로그 안의 버튼은 Radix Portal을 넘어 부모 폼으로
          이벤트가 버블한다(`retail-settings` F2) */}
      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
      >
        <Dialog.Content onCloseAutoFocus={focus.restore}>
          <Dialog.Title>
            {current ? BANK_CONFIRM.editTitle : BANK_CONFIRM.createTitle}
          </Dialog.Title>
          <Dialog.Description>{BANK_CONFIRM.description}</Dialog.Description>

          {pending ? (
            <div className="mt-4">
              {/* 요약이 아니라 대조용이다 — 친 값을 그대로 다시 보여 준다 */}
              <SummaryList
                items={[
                  { label: "은행", value: pending.bankName },
                  { label: "계좌번호", value: pending.accountNo },
                  { label: "예금주", value: pending.holder },
                ]}
              />
            </div>
          ) : null}

          {current ? (
            <div className="mt-4">
              {/* 수정은 **덮어쓰기**다 — 두 값을 같이 보여 주지 않으면 고친 자리를
                  눈으로 대조할 수 없다 */}
              <WarnNotice>
                지금 등록된 계좌({current.bankName} {current.accountNo})는 이
                값으로 바뀌어요.
              </WarnNotice>
            </div>
          ) : null}

          <Dialog.Footer>
            <Dialog.Close asChild>
              {/* `Button`에 type 기본값이 없다 — 폼 안이면 submit이 된다 */}
              <Button type="button" variant="line">
                {BANK_CONFIRM.cancel}
              </Button>
            </Dialog.Close>
            <Button type="button" onClick={confirm}>
              {current ? BANK_CONFIRM.editConfirm : BANK_CONFIRM.createConfirm}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <AuthFoot>
        {current
          ? "바꾼 계좌는 상단 계정 메뉴에서 바로 확인할 수 있어요"
          : "나중에 입력해도 돼요. 상단 계정 메뉴에서 언제든 등록할 수 있어요"}
      </AuthFoot>
    </>
  );
}
