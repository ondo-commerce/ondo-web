"use client";

import { Popover, cn } from "@ondo/ui";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * 주문 내역 툴바의 필터·정렬 드롭다운.
 *
 * 항목이 **버튼이 아니라 링크**인 것이 의도다. 좁혀 둔 조건은 주소에 있어야
 * 상세를 갔다 와도 남고, 링크면 새 탭·미리보기·뒤로 가기가 전부 산다.
 * `Select`(Radix)를 쓰지 않는 이유도 같다 — 저건 폼 컨트롤이라 항목이 `<a>`가
 * 될 수 없고, 값이 바뀐 뒤에야 이동해서 첫 HTML에 조건이 안 실린다.
 *
 * `features/catalog`에 같은 모양이 있지만 feature끼리 직접 참조하지 않는다.
 * 사용처가 둘이 됐으니 `shared/`로 올릴 때가 됐는데(Rule of Two), 이번 회차는
 * 주문 도메인을 `features/order` 하나에 모으는 것이 먼저다(S1-5) — 승격은
 * 별도 이슈로 남긴다.
 */
export interface OrderFilterOption {
  value: string;
  label: string;
  href: string;
}

function DropdownItems({
  options,
  value,
  onNavigate,
}: {
  options: readonly OrderFilterOption[];
  value: string;
  onNavigate: () => void;
}) {
  return (
    <div className="scroll-slim max-h-(--radix-popover-content-available-height) overflow-y-auto">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Link
            key={option.value}
            href={option.href}
            onClick={onNavigate}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "hover:bg-secondary text-body flex h-8.5 items-center gap-2 rounded-md px-2.5",
              selected
                ? "text-foreground font-medium"
                : "text-secondary-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {selected ? (
              <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function DropdownShell({
  children,
  options,
  value,
  contentClassName,
}: {
  children: ReactNode;
  options: readonly OrderFilterOption[];
  value: string;
  contentClassName?: string;
}) {
  /* 열림 상태를 직접 든다 — 항목을 누르면 화면이 바뀌는데 Radix는 이동을
     모른다. 닫아 주지 않으면 새 목록 위에 떠 있다 */
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Content
        align="start"
        collisionPadding={12}
        className={cn("shadow-dropdown w-44 p-1.5", contentClassName)}
      >
        <DropdownItems
          options={options}
          value={value}
          onNavigate={() => setOpen(false)}
        />
      </Popover.Content>
    </Popover>
  );
}

/**
 * 축 하나를 좁히는 필터 버튼. 고른 값이 있으면 **버튼이 검게 채워지고** 라벨이
 * 그 값으로 바뀐다 — 어느 축이 걸려 있는지 드롭다운을 열지 않고도 보여야 한다.
 * 게이트 D1대로 강조색 없이 무채색이다.
 */
export function OrderFilterDropdown({
  label,
  options,
  value,
  active,
}: {
  /** 버튼에 보이는 지금 값 */
  label: string;
  options: readonly OrderFilterOption[];
  value: string;
  /** 기본값이 아닌가. 채움 여부가 여기서 갈린다 */
  active: boolean;
}) {
  return (
    <DropdownShell options={options} value={value}>
      <button
        type="button"
        aria-label={`${label} 필터`}
        className={cn(
          "text-body flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-3 whitespace-nowrap transition-colors",
          active
            ? "bg-foreground text-card"
            : "bg-secondary text-secondary-foreground hover:bg-secondary-strong",
        )}
      >
        {label}
        <ChevronDown
          aria-hidden
          absoluteStrokeWidth
          strokeWidth={2}
          className={cn(
            "size-3 shrink-0",
            active ? "text-card" : "text-border-strong",
          )}
        />
      </button>
    </DropdownShell>
  );
}

/** 정렬 드롭다운. 늘 하나가 골라져 있어서 채움 상태가 없다 */
export function OrderSortDropdown({
  options,
  value,
  selectedLabel,
}: {
  options: readonly OrderFilterOption[];
  value: string;
  selectedLabel: string;
}) {
  return (
    <DropdownShell options={options} value={value} contentClassName="w-36">
      <button
        type="button"
        aria-label={`정렬, ${selectedLabel}`}
        className="hover:bg-secondary text-body text-foreground flex h-8 cursor-pointer items-center gap-1 rounded-control px-2"
      >
        {selectedLabel}
        <ChevronDown
          aria-hidden
          absoluteStrokeWidth
          strokeWidth={2}
          className="text-border-strong size-3 shrink-0"
        />
      </button>
    </DropdownShell>
  );
}
