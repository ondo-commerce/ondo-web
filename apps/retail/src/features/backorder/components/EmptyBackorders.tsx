import { Button } from "@ondo/ui";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { EMPTY_BACKORDERS } from "../constants";

/**
 * 서버가 준 장이 0건일 때. 아이콘 하나 · 한 줄 설명 · **다음 행동 버튼 두 개**가
 * 빈 상태의 공통 형식이다(RT-33 · `features/cart`의 `EmptyCart`와 같은 모양).
 *
 * 왜 머리글 + `합계 0장`을 그대로 두지 않는가: 실서버에서 미송 0건은 대부분 사장의
 * 평소 상태인데, 열 이름 7개와 `0장`만 서 있으면 화면이 고장난 건지 미송이 없는 건지
 * 사장이 가를 수 없다(wire 회차 F1).
 *
 * 두 번째 버튼이 장바구니의 `주문 내역에서 다시 주문`이 아니라 `주문 내역 보기`인 이유:
 * 미송이 없다는 건 확정된 주문의 물건이 다 들어왔다는 뜻이라, 다음 행동은 재주문이
 * 아니라 **들어온 물건이 어느 주문 것인지 확인**하는 쪽이다. 형식(버튼 2개)만 따르고
 * 글자는 이 화면의 다음 행동으로 적는다.
 *
 * 두 버튼 다 실제로 이동하는 `<a>`다 — 빈 화면에서 유일하게 누를 것이 아무 데도
 * 가지 않으면 사장이 갇힌다(`retail-cart` 회차 F2).
 *
 * 이 feature 안에만 둔다. 같은 껍데기가 cart·settlement·catalog에도 각각 있지만
 * 아이콘·문구·버튼이 화면마다 달라 아직 공통으로 내릴 만한 것이 없다(Rule of Two는
 * "같은 것"의 두 번째 사용처를 말한다).
 */
export function EmptyBackorders() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <PackageCheck aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">{EMPTY_BACKORDERS.title}</h3>
      <p className="text-muted-foreground text-body">
        {EMPTY_BACKORDERS.description}
      </p>
      <div className="mt-3.5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">상품 둘러보기</Link>
        </Button>
        <Button asChild variant="line">
          <Link href="/orders">주문 내역 보기</Link>
        </Button>
      </div>
    </div>
  );
}
