/**
 * ⚠️ 손으로 적은 wire 타입이다. 원래는 스펙에서 생성한 것을 써야 하지만(ADR-0002)
 * 서버 스펙(`/v3/api-docs`)이 아직 dev에서 열리지 않아 코드젠 입력이 없다.
 * 스냅샷이 들어오는 즉시 `components["schemas"]["RetailerResponse"]` 별칭으로 바꾼다.
 *
 * `shared/`에 있는 이유: 로그인(feature)과 세션 가드(shared)가 같은 응답을 본다.
 * feature → shared 방향은 열려 있고 반대는 막혀 있어서 아래쪽에 둔다.
 */

/** 가입 심사 상태. 서버는 enum을 코드 문자열로 내린다 */
export type ApprovalStatus = "APPROVED" | "PENDING" | "REJECTED";

/** 로그인 · `/me` 응답. 승인 대기·거절 화면까지 이 하나로 그린다 */
export interface RetailerResponse {
  retailerId: number;
  email: string;
  shopName: string;
  approvalStatus: ApprovalStatus;
  /** ISO 8601 */
  appliedAt: string;
  approvedAt: string | null;
  rejection: {
    reason: string;
    /** 항상 "운영자". 서버가 가려서 내린다 */
    actor: string;
    rejectedAt: string;
  } | null;
}
