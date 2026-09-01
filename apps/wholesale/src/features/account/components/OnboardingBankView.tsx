"use client";

import { Button, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { ACCOUNT_PATH } from "../constants";
import { saveBankAccount, skipBankPrompt, useSession } from "../store";
import type { BankAccount } from "../types";
import { AuthFoot, AuthPanel, AuthSection } from "./AuthPanel";
import { BankAccountForm } from "./BankAccountForm";

/**
 * 최초 로그인 정산 계좌 온보딩.
 *
 * 이 값이 **소매 화면의 「입금 계좌 안내」로 그대로 나간다** — 소매 사장은 그걸
 * 보고 자기 은행 앱에서 송금한다. 지금 소매 `features/settlement/fixtures.ts`의
 * 계좌는 마스킹 더미이고, 도매 쪽에 계좌를 받는 자리가 없어서 그 값이 영원히
 * 채워지지 않는다.
 *
 * **건너뛸 수 있다.** 계좌를 안 넣었다고 ERP 전체를 막으면 계좌와 무관한 업무
 * (주문 확인·재고 입고·출고)까지 멈춘다 — 아침에 주문부터 확인해야 하는 사장을
 * 계좌 화면에 가둬 두는 건 업무 순서를 앱이 정하는 일이다. 대신 안 넣은 사실은
 * 상단 계정 메뉴에 상시로 남는다.
 *
 * 정산 탭은 **한 파일도 건드리지 않는다.** 등록한 계좌를 다시 보는 자리는
 * 이번 회차에서 계정 메뉴 하나다 — 정산 탭에는 지금 계좌 관리 화면과 선수금이
 * 동시에 들어오고 있어 그 한가운데를 건드리면 충돌만 만든다.
 */
export function OnboardingBankView() {
  const router = useRouter();
  const session = useSession();
  const email = session.state === "signedIn" ? session.account.email : null;

  const finish = (register: (email: string) => void) => {
    if (email) register(email);
    /* `replace`다 — 뒤로 가기로 이 화면에 돌아오면 이미 낸 계좌를 또 내라고
       말하는 화면이 뜬다 */
    router.replace(ACCOUNT_PATH.erpHome);
  };

  const register = (account: BankAccount) => {
    finish((signedIn) => saveBankAccount(signedIn, account));
  };

  return (
    <>
      <AuthPanel
        title="정산 계좌를 등록해 주세요"
        lead="소매 사장님이 이 계좌를 보고 입금해요. 등록 전에는 소매 화면에 계좌가 비어 있어요."
      >
        <AuthSection>
          <BankAccountForm
            onSubmit={register}
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
                    등록하고 시작하기
                  </Button>
                  {/* 건너뛰기를 숨기지 않는다 — 찾아야 하는 탈출구는 탈출구가 아니다 */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => finish(skipBankPrompt)}
                  >
                    나중에 입력하기
                  </Button>
                </AuthSection>
              </>
            }
          />
        </AuthSection>
      </AuthPanel>

      <AuthFoot>
        나중에 입력해도 돼요. 상단 계정 메뉴에서 언제든 등록할 수 있어요
      </AuthFoot>
    </>
  );
}
