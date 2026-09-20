import { Panel } from "@ondo/ui";
import { PARTNERS_SUB } from "../constants";
import type { PartnerSettlement } from "../types";
import { EmptyPartners } from "./EmptyPartners";
import { PartnerCards } from "./PartnerCards";
import { PartnerTable } from "./PartnerTable";

/**
 * 거래처 관리 — 패널 하나, 표 하나. 값은 정산과 **같은 응답**(`GET /settlements`)이다.
 *
 * **승인 관리가 아니라 「거래 이력 조회」다**(§3-0 A). 목록에 서는 기준은 주문
 * 이력 하나라, 마켓에 상품이 걸려 있어도 주문한 적 없는 도매처는 여기 없다.
 *
 * 거래처 목록 전용 API가 없어(#240 · `/api/retail/wholesalers` 404) 정산 응답으로
 * 채울 수 있는 열만 있다. 위치 · 마지막 주문 · 진행 중 · 미송 · 전화는 응답에 없어
 * **열을 뺐다** — 더미로 채우면 실서버 도매처 옆에 지어낸 값이 실데이터처럼 선다.
 *
 * 기다림은 `(shop)/loading.tsx`, 실패는 `(shop)/error.tsx`가 그린다.
 */
export function PartnersView({
  rows,
}: {
  /** 거래한 도매처 전부. 정산 화면과 같은 순서(미수 잔액 내림차순) */
  rows: readonly PartnerSettlement[];
}) {
  return (
    /* 주문 내역·정산과 같은 폭(#217 R2) */
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={PARTNERS_SUB}
          action={
            /* 이 숫자는 표 본문 줄 수 그 자체다 — 따로 세면 어긋난다 */
            <span className="text-muted-foreground text-body">
              거래처{" "}
              <b className="text-foreground font-medium">{rows.length}</b>곳
            </span>
          }
        >
          거래처 관리
        </Panel.Title>

        {rows.length === 0 ? (
          <EmptyPartners />
        ) : (
          <>
            {/* 같은 목록을 폭에 따라 다른 모양으로 그린다. 값은 둘 다 `rows` 하나에서
              나오므로 폭이 바뀌어도 말이 갈리지 않는다. 경계가 `tablet`(≤960px)인
              이유는 `PartnerCards`의 주석에 있다(F3) */}
            <div className="tablet:block hidden">
              <PartnerCards rows={rows} />
            </div>
            <div className="tablet:hidden">
              <PartnerTable rows={rows} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
