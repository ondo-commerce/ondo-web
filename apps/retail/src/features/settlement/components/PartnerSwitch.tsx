"use client";

import { Button, Popover, cn } from "@ondo/ui";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { PartnerSettlement } from "../types";

/**
 * 원장의 `도매처 바꾸기`.
 *
 * 항목이 **버튼이 아니라 링크**다. 지금 보고 있는 도매처는 주소(`?wholesaler=`)에
 * 있어야 브라우저 뒤로 가기로 직전 원장에 돌아올 수 있다 — `retail-market` 회차가
 * "펼친 상태가 뒤로 가기에서 사라진다"로 같은 종류를 겪었다. `features/catalog`의
 * `FilterDropdown`이 같은 이유로 같은 모양이지만, feature끼리 직접 import하지
 * 않으므로(`CLAUDE.md`) 여기 다시 만든다.
 *
 * 열림 상태를 직접 들고 있는 것은 Radix가 이동을 모르기 때문이다 — 닫아 주지
 * 않으면 새 원장 위에 드롭다운이 떠 있다.
 */
export function PartnerSwitch({
  rows,
  currentId,
}: {
  rows: readonly PartnerSettlement[];
  currentId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="line" size="sm">
          도매처 바꾸기
          <ChevronDown
            aria-hidden
            absoluteStrokeWidth
            strokeWidth={2}
            className="text-border-strong size-3 shrink-0"
          />
        </Button>
      </Popover.Trigger>

      <Popover.Content
        align="end"
        collisionPadding={12}
        className="w-44 p-1.5 shadow-dropdown"
      >
        {rows.map((row) => {
          const selected = row.wholesalerId === currentId;

          return (
            <Link
              key={row.wholesalerId}
              href={`/settlements?wholesaler=${row.wholesalerId}`}
              onClick={() => setOpen(false)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "hover:bg-secondary text-body flex h-8.5 items-center gap-2 rounded-md px-2.5",
                selected
                  ? "text-foreground font-medium"
                  : "text-secondary-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {selected ? (
                <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
              ) : null}
            </Link>
          );
        })}
      </Popover.Content>
    </Popover>
  );
}
