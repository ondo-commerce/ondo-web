"use client";

import { Popover } from "@ondo/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ACCOUNT_MENU_ITEMS } from "@/shared/config/nav";
import { SHELL_ACCOUNT } from "@/shared/fixtures";

/**
 * 헤더 오른쪽 끝 계정 칩 + 드롭다운 7항목.
 *
 * `Popover`(Radix)를 쓰는 이유는 Esc·바깥 클릭·포커스 이동을 직접 만들지 않기
 * 위해서다. `role="menu"`는 쓰지 않는다 — 항목이 전부 링크라 Tab으로 순회하는 게
 * 맞고, menu를 선언하면 화살표 키 조작을 기대하게 만들어 놓고 주지 못한다.
 *
 * 열림 상태를 직접 들고 있는 이유: 항목을 누르면 화면이 바뀌는데 Radix는 링크
 * 이동을 모른다. 누르는 순간 닫아 주지 않으면 새 화면 위에 메뉴가 떠 있다.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="hover:bg-secondary focus-visible:ring-ring flex h-8 cursor-pointer items-center gap-1.5 rounded-control pr-2 pl-1.5 focus-visible:ring-2 focus-visible:outline-hidden">
        <span
          aria-hidden
          className="bg-secondary text-secondary-foreground grid size-5.5 place-items-center rounded-md text-xs tracking-normal"
        >
          {SHELL_ACCOUNT.initial}
        </span>
        {SHELL_ACCOUNT.storeName}
        <ChevronDown aria-hidden className="text-border-strong size-3" />
      </Popover.Trigger>

      {/* Popover 기본 그림자는 --shadow-float(0 12px 40px/10%)다. 모달처럼 크게 뜬
          표면에 맞춘 값이라 헤더에 붙어 내려오는 이 드롭다운에는 과하다.
          확정 와이어프레임 `.menu`는 --shadow-dropdown(0 4px 12px/8%)을 쓴다 */}
      <Popover.Content align="end" className="w-45 p-1.5 shadow-dropdown">
        <nav aria-label="계정 메뉴">
          {ACCOUNT_MENU_ITEMS.map(({ href, label, separated }) => (
            <div key={href}>
              {separated ? (
                <div className="bg-border mx-1 my-1.5 h-px" />
              ) : null}
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className="text-secondary-foreground hover:bg-secondary hover:text-foreground text-body flex h-8.5 items-center rounded-md px-2.5"
              >
                {label}
              </Link>
            </div>
          ))}
        </nav>
      </Popover.Content>
    </Popover>
  );
}
