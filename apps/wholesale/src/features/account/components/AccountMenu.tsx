"use client";

import { IconButton, Popover } from "@ondo/ui";
import { CircleUser, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_PATH, SESSION_DISCLAIMER } from "../constants";
import { signOut, useSession } from "../store";

/**
 * 상단 헤더 오른쪽 끝 계정 드롭다운.
 *
 * `Popover`(Radix)를 쓰는 이유는 Esc·바깥 클릭·포커스 이동을 직접 만들지 않기
 * 위해서다. `role="menu"`는 쓰지 않는다 — 항목이 링크와 버튼이라 Tab으로
 * 순회하는 게 맞고, menu를 선언하면 화살표 키 조작을 기대하게 만들어 놓고
 * 주지 못한다.
 *
 * **상호명을 스스로 알지 않는다.** 셸(`shared/`)이 더미를 따로 들고 있으면
 * 세션이 바뀐 순간 헤더와 본문이 다른 이름을 말한다. 세션 보관소가 원본이다.
 *
 * ⚠️ 이 컴포넌트는 `features/account`에 있고 헤더는 `shared/`에 있다.
 *    `shared → features` 참조는 금지라(ESLint), 끼워 넣는 일은 `app/(erp)/layout.tsx`가
 *    한다 — import 방향이 `app → features → shared` 한 방향으로 남는다.
 */
export function AccountMenu() {
  const router = useRouter();
  const session = useSession();
  const [open, setOpen] = useState(false);

  /* 가드 안쪽에서만 그려지므로 실제로는 늘 로그인 상태다. 판정 전 한 프레임에
     헤더에서 버튼이 사라졌다 나타나지 않도록, 아이콘 자리는 늘 남긴다 */
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

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
                /* `replace`다 — 뒤로 가기로 로그아웃 직전 화면에 돌아가면
                   가드가 다시 튕겨서 화면이 두 번 깜빡인다 */
                router.replace(ACCOUNT_PATH.login);
              }}
              className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 w-full cursor-pointer items-center gap-2 rounded-md px-2.5"
            >
              <LogOut aria-hidden className="size-3.5 shrink-0" />
              로그아웃
            </button>

            {/* 흉내라는 사실을 감추지 않는다. 로그아웃 바로 아래가, 사장이
                "왜 갑자기 로그아웃됐지"를 묻는 자리다 */}
            <p className="text-muted-foreground mt-1.5 px-2.5 pb-1 text-xs leading-4.5">
              {SESSION_DISCLAIMER}
            </p>
          </>
        ) : null}
      </Popover.Content>
    </Popover>
  );
}
