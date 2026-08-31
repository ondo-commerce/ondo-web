"use client";

import { ColorDot, Popover, cn } from "@ondo/ui";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * 목록 상단 필터·정렬 드롭다운.
 *
 * 항목이 **버튼이 아니라 링크**인 것이 의도다. 좁혀 둔 조건은 주소에 있어야
 * 상품 상세를 갔다 와도 남고, 링크면 새 탭·미리보기·뒤로 가기가 전부 산다.
 * `Select`(Radix)를 쓰지 않는 이유도 같다 — 저건 값을 바꾸는 폼 컨트롤이라
 * 항목이 <a>가 될 수 없다.
 *
 * 열림 상태를 직접 들고 있는 것은 `AccountMenu`와 같은 이유다 — 항목을 누르면
 * 화면이 바뀌는데 Radix는 이동을 모른다. 닫아 주지 않으면 새 목록 위에 떠 있다.
 */
export interface FilterOption {
  value: string;
  label: string;
  href: string;
  /** 색상 항목만. 이름 옆에 점을 찍는다 — 색만으로 구분하지 않는다 */
  hex?: string;
}

function DropdownItems({
  options,
  value,
  onNavigate,
}: {
  options: readonly FilterOption[];
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
            {option.hex ? (
              <ColorDot color={option.hex} className="size-3.5" />
            ) : null}
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
  /** 트리거 버튼. `asChild`로 넘기므로 실제 <button> 하나여야 한다 */
  children: ReactNode;
  options: readonly FilterOption[];
  value: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Content
        align="start"
        collisionPadding={12}
        className={cn("w-48 p-1.5 shadow-dropdown", contentClassName)}
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
 * 축 하나를 좁히는 필터 버튼. 고른 값이 있으면 **버튼 자체가 검게 채워지고**
 * 라벨이 그 값으로 바뀐다(`_base.css` `.fbtn[data-on]`) — 어느 축이 걸려 있는지
 * 드롭다운을 열지 않고도 보여야 한다. 게이트 D1대로 강조색 없이 무채색이다.
 */
export function FilterDropdown({
  label,
  options,
  value,
  selectedLabel,
}: {
  /** 축 이름. 아무것도 안 골랐을 때 버튼에 그대로 나온다 */
  label: string;
  options: readonly FilterOption[];
  value: string;
  /** 고른 값의 표시명. 없으면 아무것도 안 고른 것이다 */
  selectedLabel?: string;
}) {
  const active = Boolean(selectedLabel);

  return (
    <DropdownShell options={options} value={value}>
      <button
        type="button"
        aria-label={
          active ? `${label} 필터, ${selectedLabel}` : `${label} 필터`
        }
        className={cn(
          "text-body flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-3 transition-colors",
          active
            ? "bg-foreground text-card"
            : "bg-secondary text-secondary-foreground hover:bg-secondary-strong",
        )}
      >
        {selectedLabel ?? label}
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

/** 정렬 드롭다운. 필터와 달리 늘 하나가 골라져 있어서 채움 상태가 없다 */
export function SortDropdown({
  options,
  value,
  selectedLabel,
}: {
  options: readonly FilterOption[];
  value: string;
  selectedLabel: string;
}) {
  return (
    <DropdownShell options={options} value={value} contentClassName="w-40">
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
