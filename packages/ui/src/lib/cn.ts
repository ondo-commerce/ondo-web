import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge에 **커스텀 글자 크기 토큰을 알려준 것**이다.
 *
 * 왜 필요한가: `text-body`(= --text-body, 13px)는 이 레포가 만든 슬롯이라 tailwind-merge의
 * 기본 사전에 없다. 모르는 `text-{단어}`는 **색상으로 분류**되므로 `text-muted-foreground`와
 * 같은 그룹으로 묶이고, 뒤에 온 쪽만 남는다.
 *
 * 실제로 그래서 **모든 표의 머리글이 회색이 아니었다** — `Table.Th`가
 * `"... text-muted-foreground ... text-body ..."` 순서라 색상이 통째로 지워지고
 * 기본 글자색(진한 회색)으로 그려지고 있었다. `Chip`에 `text-body`를 얹은 자리도 같았다.
 *
 * 등록해 두면 크기는 크기끼리만 충돌한다(`text-sm` ↔ `text-body`는 여전히 뒤가 이긴다).
 * **theme.css에 `--text-*` 슬롯을 새로 만들면 여기에도 같이 추가해야 한다.**
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["body"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
