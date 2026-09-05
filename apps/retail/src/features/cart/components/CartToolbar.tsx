"use client";

import { Button, Checkbox } from "@ondo/ui";
import { X } from "lucide-react";
import { CART_ACTION_ID } from "../constants";

/**
 * 전체 선택 + 선택 삭제.
 *
 * **확인 모달을 두지 않는다**(게이트 Q3). 대신 되돌릴 길을 셋으로 나눠 놓았다 —
 * ① 버튼 라벨이 **몇 개가 지워지는지**를 누르기 전에 말하고, ② 그 수는 화면에
 * 지금 보이는 줄이 아니라 **선택 집합**에서 나오며(접힘·필터가 생겨도 대상이
 * 달라지지 않는다), ③ 지운 뒤 `되돌리기`가 남는다.
 *
 * ③은 이 파일이 아니라 `RemovedNotice`가 그린다. 여기 있던 동안에는 담긴 것을
 * 전부 지우면 툴바가 통째로 안 그려지면서 되돌리기도 같이 사라졌다 — 빈 상태에서
 * 되돌릴 길이 없어지던 자리다.
 *
 * 0개일 때는 진짜 `disabled`다. `aria-disabled="true"`만 걸어 두면 보조기술은
 * 못 누른다고 읽는데 실제로는 눌려서, 되돌릴 수 없는 실행이 그냥 일어난다
 * (직전 회차 F11). 서버로 요청이 나가 있는 동안(`busy`)도 같다 — DELETE가 돌아오기
 * 전에 한 번 더 눌리면 같은 줄을 두 번 지우려 든다.
 */
export function CartToolbar({
  allOn,
  counter,
  selectedCount,
  busy,
  onToggleAll,
  onRemoveSelected,
}: {
  allOn: boolean;
  /** `(3/4)` */
  counter: string;
  selectedCount: number;
  /** 장바구니를 바꾸는 요청이 나가 있다 */
  busy: boolean;
  onToggleAll: (on: boolean) => void;
  onRemoveSelected: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-body">
        <Checkbox
          checked={allOn}
          onCheckedChange={(next) => onToggleAll(next === true)}
          className="size-4.5"
        />
        전체 선택 <span className="text-muted-foreground">{counter}</span>
      </label>

      <Button
        id={CART_ACTION_ID.removeSelected}
        variant="ghost"
        size="sm"
        disabled={selectedCount === 0 || busy}
        onClick={onRemoveSelected}
      >
        <X aria-hidden className="size-4" />
        {/* 대상 수를 라벨에 박는다 — 누르기 전에 몇 개가 사라지는지 안다 */}
        선택 삭제 {selectedCount > 0 ? `(${selectedCount})` : null}
      </Button>
    </div>
  );
}
