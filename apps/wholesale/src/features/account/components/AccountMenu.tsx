"use client";

import { IconButton, Popover } from "@ondo/ui";
import { CircleUser, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_PATH, BANK_MENU_LABEL } from "../constants";
import { useLogoutMutation } from "../api/session";
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
  const logoutMutation = useLogoutMutation();
  const [open, setOpen] = useState(false);

  /* 판정 전 한 프레임에 헤더에서 버튼이 사라졌다 나타나지 않도록 아이콘 자리는
     늘 남긴다 */
  const account = session.state === "signedIn" ? session.account : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton
          variant="ghost"
          aria-label={
            account ? `${account.storeName || account.email} 계정 메뉴` : "계정"
          }
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
              {/* 상호명은 서버에 `GET /me`가 생겨야 알 수 있다. 모르면 줄을 아예
                  그리지 않는다 — 빈 줄은 "상호명이 없는 계정"으로 읽힌다 */}
              {account.storeName ? (
                <p className="truncate text-sm font-medium">
                  {account.storeName}
                </p>
              ) : null}
              <p className="text-muted-foreground truncate text-xs">
                {account.email}
              </p>
            </div>

            <div className="bg-border mx-1 my-1.5 h-px" />

            {/* 계좌는 정산 탭의 「내 정산 계좌」가 서버로 다룬다. 여기서 세션에만
                적던 계좌 줄은 서버에 없는 계좌를 "등록됨"으로 말했다(`side-02` N3) */}
            <Link
              href={ACCOUNT_PATH.settlements}
              onClick={() => setOpen(false)}
              className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 items-center gap-2 rounded-md px-2.5"
            >
              <Wallet aria-hidden className="size-3.5 shrink-0" />
              {BANK_MENU_LABEL}
            </Link>

            <div className="bg-border mx-1 my-1.5 h-px" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                /* 서버 세션을 먼저 끊는다. 실패해도 기다리지 않는다 — 쿠키가
                   남아도 이 브라우저에서 할 수 있는 일이 없고, 로그아웃을 누른
                   사람을 네트워크 사정 때문에 붙잡아 두면 안 된다 */
                void logoutMutation.mutateAsync().catch(() => undefined);
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
          </>
        ) : null}
      </Popover.Content>
    </Popover>
  );
}
