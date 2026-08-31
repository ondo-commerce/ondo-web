"use client";

import { Button, Input, Popover } from "@ondo/ui";
import { useState } from "react";
import { QTY_ISSUE_TEXT, QTY_UNIT, SKU_ORDER_LIMIT } from "../constants";
import { parseQty } from "../derive";

/**
 * 색상 그룹 하나에 같은 수량을 한 번에 넣는 팝오버 — 값 한 칸 + `적용`.
 *
 * **인라인 입력이 아니라 팝오버인 이유**(게이트 Q5): 인라인이면 표 머리 줄이
 * 입력칸 높이만큼 늘어나 그룹마다 표가 위아래로 흔들린다. 팝오버는 표 위에
 * 떠 있어서 지금 어느 그룹에 넣는지 보이는 채로 값을 친다.
 *
 * 적용 대상은 **이 그룹에 실제로 게시된 행 전부**다. 게시 안 된 조합은 화면에
 * 줄 자체가 없고, 그래서 값이 들어갈 자리도 없다 — 도매 5회차에서 네 번 나온
 * "화면에 없는 대상에 실행이 걸림" 결함이 구조적으로 생기지 않는다.
 *
 * 상한을 넘긴 값은 여기서도 잡는다. 표 한 칸씩 고쳐 놓고 일괄 입력으로 다시
 * 뚫리면 방어가 있는 것이 아니다.
 */
export function BulkQtyPopover({
  colorLabel,
  rowCount,
  onApply,
  disabled = false,
}: {
  /** 색상 표기. 팝오버 안내와 적용 후 신호에 그대로 쓰인다 */
  colorLabel: string;
  /** 이 그룹에 게시된 사이즈 행 수 */
  rowCount: number;
  onApply: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const { qty, issue } = parseQty(draft);
  /* 0장을 일괄로 넣는 것은 "이 그룹 지우기"라 허용한다. 못 읽는 글자만 막는다 */
  const blocked = issue === "NOT_A_NUMBER" || draft.trim() === "";

  const apply = () => {
    if (blocked) return;
    onApply(String(qty));
    setDraft("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        /* 열 때마다 빈 칸에서 시작한다 — 지난번에 치다 만 값이 남아 있으면
           확정하지 않은 것이 확정된 것처럼 보인다 */
        if (next) setDraft("");
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${colorLabel} 일괄 입력`}
          className="text-muted-foreground hover:text-foreground border-border-strong ml-auto cursor-pointer border-b text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          일괄 입력
        </button>
      </Popover.Trigger>

      <Popover.Content align="end" className="w-60 p-3">
        <p className="text-body">
          <span className="font-medium">{colorLabel}</span> 사이즈 {rowCount}
          칸에 같은 수량을 넣어요.
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          <Input
            size="sm"
            numeric
            inputMode="numeric"
            aria-label={`${colorLabel} 일괄 수량`}
            placeholder={`0 ~ ${SKU_ORDER_LIMIT}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
          />
          <Button size="sm" onClick={apply} disabled={blocked}>
            적용
          </Button>
        </div>

        {issue ? (
          <p className="text-destructive mt-2 text-xs">
            {QTY_ISSUE_TEXT[issue]}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            0{QTY_UNIT}을 넣으면 이 색상의 수량이 지워져요.
          </p>
        )}
      </Popover.Content>
    </Popover>
  );
}
