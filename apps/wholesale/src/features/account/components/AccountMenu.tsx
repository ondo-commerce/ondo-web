"use client";

import { IconButton, Popover } from "@ondo/ui";
import { CircleUser, LogOut, Pencil, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ACCOUNT_PATH,
  BANK_MENU_LABEL,
  SESSION_DISCLAIMER,
} from "../constants";
import { bankAccountSummary } from "../derive";
import { signOut, useSession } from "../store";

/**
 * 상단 헤더 오른쪽 끝 계정 드롭다운.
 *
 * `role="menu"`는 쓰지 않는다 — 항목이 링크와 버튼이라 Tab으로 순회하는 게 맞고,
 * menu를 선언하면 화살표 키 조작을 기대하게 만들어 놓고 주지 못한다.
 *
 * **상호명을 스스로 알지 않는다.** 셸(`shared/`)이 더미를 따로 들면 세션이 바뀐
 * 순간 헤더와 본문이 다른 이름을 말한다 — 세션 보관소가 원본이다. 끼워 넣는 일은
 * `app/(erp)/layout.tsx`가 한다(`shared → features` 참조 금지).
 */
export function AccountMenu() {
  const router = useRouter();
  const session = useSession();
  const [open, setOpen] = useState(false);

  /* 판정 전 한 프레임에 헤더에서 버튼이 사라졌다 나타나지 않도록 아이콘 자리는
     늘 남긴다 */
  const account = session.state === "signedIn" ? session.account : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton
          variant="ghost"
          aria-label={account ? `${account.storeName} 계정 메뉴` : "계정"}
          title="계정"
        >
          <CircleUser aria-hidden />
        </IconButton>
      </Popover.Trigger>

      {/* Popover 기본 그림자는 --shadow-float(모달용)라 헤더에 붙어 내려오는
          드롭다운에는 과하다. 확정 와이어프레임 `.menu`는 --shadow-dropdown이다 */}
      <Popover.Content align="end" className="w-64 p-1.5 shadow-dropdown">
        {account ? (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">
                {account.storeName}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {account.email}
              </p>
            </div>

            <div className="bg-border mx-1 my-1.5 h-px" />

            {/* 정산 탭의 「내 정산 계좌」는 별건 이슈라(그쪽에 계좌 관리와 선수금이
                동시에 들어오는 중이다) 계좌를 보고 고치는 자리를 여기 하나 둔다.
                안 넣은 사실이 상시로 남아야 건너뛴 계좌가 잊히지 않는다 */}
            {account.bankAccount ? (
              <>
                <p className="text-secondary-foreground text-body flex items-start gap-2 px-2.5 py-1.5">
                  <Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="text-muted-foreground">
                      {BANK_MENU_LABEL.registered}
                    </span>{" "}
                    <span className="tabular-nums">
                      {bankAccountSummary(account.bankAccount)}
                    </span>
                  </span>
                </p>
                {/* 읽기 전용 한 줄 **옆에** 고치는 길을 둔다 — 이 줄만 남았을 때
                    한 자 틀린 계좌번호를 고칠 방법이 없었고, 소매 사장이 그 번호로
                    송금하는 값이라 되돌릴 수도 없다(`wholesale-account` F8) */}
                <Link
                  href={ACCOUNT_PATH.bankOnboarding}
                  onClick={() => setOpen(false)}
                  className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 items-center gap-2 rounded-md px-2.5"
                >
                  <Pencil aria-hidden className="size-3.5 shrink-0" />
                  {BANK_MENU_LABEL.edit}
                </Link>
              </>
            ) : (
              <Link
                href={ACCOUNT_PATH.bankOnboarding}
                onClick={() => setOpen(false)}
                className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 items-center gap-2 rounded-md px-2.5"
              >
                <Wallet aria-hidden className="size-3.5 shrink-0" />
                {BANK_MENU_LABEL.empty}
              </Link>
            )}

            <div className="bg-border mx-1 my-1.5 h-px" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
                /* `replace`다 — 뒤로 가기로 돌아가면 가드가 다시 튕겨서 화면이
                   두 번 깜빡인다 */
                router.replace(ACCOUNT_PATH.login);
              }}
              className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 w-full cursor-pointer items-center gap-2 rounded-md px-2.5"
            >
              <LogOut aria-hidden className="size-3.5 shrink-0" />
              로그아웃
            </button>

            {/* 로그아웃 바로 아래가 "왜 갑자기 로그아웃됐지"를 묻는 자리다 */}
            <p className="text-muted-foreground mt-1.5 px-2.5 pb-1 text-xs leading-4.5">
              {SESSION_DISCLAIMER}
            </p>
          </>
        ) : null}
      </Popover.Content>
    </Popover>
  );
}
