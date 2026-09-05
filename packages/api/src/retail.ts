import type { components, paths } from "./generated/retail";

/**
 * 소매 서버 wire 타입의 유일한 입구. 도매의 `WholesaleSchema`와 같은 이유로 둔다 —
 * 앱은 `components[...]`를 직접 파지 않는다.
 *
 *   type Retailer = RetailSchema<"RetailerResponse">;
 *
 * 응답 필드가 전부 non-optional인 것도 도매와 같다(`--properties-required-by-default`).
 * 소매 스펙은 `nullable`도 안 적어서 `approvedAt`·`rejection`처럼 null이 오는 필드도
 * `string`·객체로 보인다 — 읽는 쪽이 `?? null`로 좁힌다.
 */
export type RetailSchema<K extends keyof components["schemas"]> =
  components["schemas"][K];

/** 경로 → 메서드 → 파라미터·응답. 쿼리 파라미터 이름을 맞출 때 쓴다 */
export type RetailPaths = paths;
