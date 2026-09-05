import type { RetailSchema } from "@ondo/api";

/**
 * 로그인 · `/me` 응답. 승인 대기·거절 화면까지 이 하나로 그린다.
 *
 * `shared/`에 있는 이유: 로그인(feature)과 세션 가드(shared)가 같은 응답을 본다.
 * feature → shared 방향은 열려 있고 반대는 막혀 있어서 아래쪽에 둔다.
 *
 * 스냅샷(`packages/api/openapi/retail.json`)이 들어오기 전까지 손으로 적혀 있던 걸
 * 생성 타입 별칭으로 바꿨다(ADR-0002). 손 타입 시절과 두 가지가 다르다.
 * - `approvalStatus`가 `string`이다. 스펙이 enum을 코드 문자열로만 적어서 좁혀지지
 *   않는다 — `features/account`의 `toAccountStatus`가 화면 상태로 좁힌다.
 * - `approvedAt`·`rejection`은 null이 올 수 있는데 non-optional로 보인다(README "응답
 *   필드가 전부 non-optional인 이유"). 읽는 쪽이 `?? null`로 좁힌다.
 */
export type RetailerResponse = RetailSchema<"RetailerResponse">;
