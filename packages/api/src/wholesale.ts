import type { components, paths } from "./generated/wholesale";

/**
 * 도매 서버 wire 타입의 유일한 입구. 앱은 `components[...]`를 직접 파지 않고 이걸 쓴다 —
 * 생성 파일의 경로나 스키마 이름이 바뀌어도 고칠 곳이 여기 하나가 된다.
 *
 *   type LoginResponse = WholesaleSchema<"LoginResponse">;
 *
 * 응답 필드가 전부 non-optional인 건 `codegen`의 `--properties-required-by-default` 때문이다.
 * springdoc이 응답 DTO에 `required`를 안 적어서 그대로 두면 모든 필드가 `T | undefined`가 된다.
 * 대신 **진짜 없을 수 있는 필드도 `string`으로 보인다**(예: `BankAccountResponse.memo`).
 * 스펙에 `nullable`이 붙기 전까지는 그런 필드를 읽는 쪽이 알고 있어야 한다.
 */
export type WholesaleSchema<K extends keyof components["schemas"]> =
  components["schemas"][K];

/** 경로 → 메서드 → 파라미터·응답. 쿼리 파라미터 이름을 맞출 때 쓴다 */
export type WholesalePaths = paths;
