import { Panel } from "@ondo/ui";
import { PARTNERS_SUB } from "../constants";
import { partnerListRows } from "../derive";
import { EmptyPartners } from "./EmptyPartners";
import { PartnerCards } from "./PartnerCards";
import { PartnerTable } from "./PartnerTable";

/**
 * 거래처 관리 — 패널 하나, 표 하나.
 *
 * **승인 관리가 아니라 「거래 이력 조회」다**(§3-0 A). 목록에 서는 기준은 주문
 * 이력 하나라, 마켓에 상품이 걸려 있어도 주문한 적 없는 도매처는 여기 없다.
 *
 * `미수 잔액` 열은 정산 원장에서 파생된다(`partnerListRows`) — 이 화면과
 * `/settlements`가 같은 함수를 보게 해 둔 것이 이번 회차의 핵심이다.
 *
 * 데이터가 정적 더미라 로딩·에러 상태가 없다. 지어내지 않는다.
 */
export function PartnersView() {
  const rows = partnerListRows();

  return (
    <Panel>
      <Panel.Title
        sub={PARTNERS_SUB}
        action={
          /* 이 숫자는 표 본문 줄 수 그 자체다 — 따로 세면 어긋난다 */
          <span className="text-muted-foreground text-body">
            거래처 <b className="text-foreground font-medium">{rows.length}</b>
            곳
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
  );
}
