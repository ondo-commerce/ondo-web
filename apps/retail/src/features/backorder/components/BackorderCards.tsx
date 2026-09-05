import { Button } from "@ondo/ui";
import Link from "next/link";
import { CARD_LABEL, TABLE_CAPTION, TOTAL_ROW_LABEL } from "../constants";
import {
  formatDate,
  optionLabel,
  orderHref,
  orderLinkLabel,
  qtyLabel,
} from "../derive";
import { EtaCell } from "./EtaCell";
import type { BackorderLine } from "../types";

/**
 * 좁은 폭(≤960px)의 미송 목록 — **표 대신 세로로 쌓는다.**
 *
 * 왜 표를 버리는가: 7열짜리 표는 줄바꿈 없이 그리면 679px가 필요하다. 390px 휴대폰에서는
 * 상자 안에서 가로로 스크롤되는데, 첫 화면에 남는 것이 상품·도매처·옵션뿐이고
 * **`16장`은 `장` 글자 가운데서 잘리고 예상 입고일과 `주문 보기`는 아예 화면 밖이었다.**
 * 게다가 `scroll-slim`이 `scrollbar-color: transparent`라 밀 수 있다는 신호도 없다
 * (휴대폰에는 hover가 없어서 막대가 뜰 기회 자체가 없다).
 * 사장이 이 화면을 여는 이유가 **몇 장이 언제 오는지**인데 그 둘이 첫 화면에 없었다.
 *
 * 스크롤 막대를 상시 노출하는 쪽도 있었지만, 그건 "밀면 보인다"를 알려 줄 뿐
 * 시장 한복판에서 한 손으로 표를 좌우로 미는 일 자체를 없애 주지는 않는다.
 *
 * 경계를 `tablet`(≤960px)로 잡은 이유: 표가 안 잘리는 최소 뷰포트가 744px이라
 * 640px(`phone`)에서 갈면 641~743px 구간이 여전히 잘린다. 요약 3카드도 이미 같은
 * 지점에서 1열로 접히므로(`BackorderSummary`) 화면이 한 지점에서 통째로 쌓임 모드가 된다.
 *
 * **값을 다시 세지 않는다.** 합계는 표와 같은 `summary.totalQty`를 받는다 —
 * 폭에 따라 다른 수를 말하는 화면을 만들지 않는다.
 */
export function BackorderCards({
  lines,
  today,
  totalQty,
}: {
  lines: readonly BackorderLine[];
  today: string;
  /** `summarize`가 표에 서는 목록에서 뽑은 값. 카드가 다시 더하지 않는다 */
  totalQty: number;
}) {
  return (
    <div>
      {/* 표가 `aria-label`로 이름을 갖듯 이 목록도 이름을 갖는다 — 보조기술에서
          `16장`이 무엇의 수량인지가 목록 이름에서 읽힌다 */}
      <ul aria-label={TABLE_CAPTION} className="divide-border-soft divide-y">
        {lines.map((line) => (
          <li key={line.id} className="py-3.5 first:pt-0">
            <p className="font-medium">{line.productName}</p>
            {/* 도매처와 옵션은 표에서 각자 열이었다. 좁은 폭에서는 한 줄로 붙인다 —
                라벨을 붙여 두 줄로 늘리면 정작 중요한 장수·입고일이 아래로 밀린다 */}
            <p className="text-muted-foreground text-body mt-0.5">
              {line.wholesalerName} · {optionLabel(line)}
            </p>

            {/* 라벨과 값을 dl로 묶는다. 표 머리글이 하던 일(이 숫자가 무엇인지)을
                좁은 폭에서는 이 라벨이 대신 한다 */}
            <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{CARD_LABEL.qty}</dt>
              <dd className="font-medium tabular-nums">{qtyLabel(line.qty)}</dd>

              <dt className="text-muted-foreground">{CARD_LABEL.orderedAt}</dt>
              <dd className="tabular-nums">{formatDate(line.orderedDate)}</dd>

              <dt className="text-muted-foreground">{CARD_LABEL.eta}</dt>
              {/* 표와 **같은 컴포넌트**다. 3상태 판정이 폭마다 갈리면 안 된다 */}
              <dd>
                <EtaCell line={line} today={today} />
              </dd>
            </dl>

            <Button asChild variant="line" size="sm" className="mt-3">
              <Link href={orderHref(line)} aria-label={orderLinkLabel(line)}>
                주문 보기
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      {/* 표의 tfoot 자리. 윗선만 gray-200이다(`_base.css` `.tbl tfoot td{border-top:1px solid var(--border)}`)
          — 행 사이 구분선(gray-100)보다 한 단계 진해야 합계가 목록에서 떨어져 읽힌다 */}
      <div className="border-border mt-3 flex items-center justify-between border-t pt-3 font-medium">
        <span>{TOTAL_ROW_LABEL}</span>
        <span className="tabular-nums">{qtyLabel(totalQty)}</span>
      </div>
    </div>
  );
}
