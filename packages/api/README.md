# @ondo/api

도매·소매 API를 **부르는 방법**만 담는다. 화면도, 도메인 판단도 여기 두지 않는다.

## 스펙은 서버에만 있다

백엔드(`ondo-commerce/ondo-api`)는 `openapi.yaml` 파일을 커밋하지 않는다. 스펙은
springdoc이 코드에서 만들어 **런타임에만** 존재한다 — `GET :8081/v3/api-docs`.

그런데 CI와 Vercel 빌드에는 그 서버가 없다. 그래서 명령을 둘로 갈랐다.

| 명령 | 서버 | 하는 일 |
|---|---|---|
| `pnpm --filter @ondo/api sync-spec` | **필요** | 스펙을 받아 키를 정렬해 `openapi/wholesale.json`에 굳히고, 이어서 `codegen` |
| `pnpm codegen` | 불필요 | 커밋된 스냅샷 → `src/generated/`. 결정적이라 CI가 drift를 잡을 수 있다 |

**BE가 스펙을 바꿨다고 알려오면 `sync-spec`을 돌린다.** 스냅샷과 생성물을 한 커밋에 올린다.
CI가 잡아주는 건 "스냅샷 ↔ 생성물"까지다 — **서버와 스냅샷이 어긋나는 건 사람만 막을 수 있다.**

## 타입 규칙

- `src/generated/`는 **손으로 고치지 않는다.**
- 서버 응답을 그대로 옮긴 타입(wire 타입)을 **직접 선언하지 않는다.** 스펙이 바뀌어도
  컴파일이 통과해 런타임에 터진다 (ADR-0002).
- 반대로 **파생·조합 타입은 손으로 써도 된다.** 화면이 계산해 만든 값은 wire가 아니다 —
  그건 각 feature의 `derive.ts` 몫이다.

## 서버가 둘이다

봉투(`{ data }`)·에러 모양·페이징 규약은 도매와 소매가 같다 → `src/runtime/`이 공유한다.
하지만 **에러 코드 값은 다르다**(미승인이 도매 `NOT_APPROVED`, 소매 `ACCOUNT_NOT_APPROVED`).
코드 목록은 `runtime/`이 아니라 앱별 상수에 둔다.

## 생성 타입을 쓰는 법

```ts
import type { WholesaleSchema } from "@ondo/api";
type LoginResponse = WholesaleSchema<"LoginResponse">;
```

`components["schemas"]`를 앱에서 직접 파지 않는다. 입구를 `WholesaleSchema` 하나로 두면
생성 파일 위치나 스키마 이름이 바뀌어도 고칠 곳이 이 패키지 안이다.

### 응답 필드가 전부 non-optional인 이유

springdoc은 응답 DTO에 `required`를 안 적는다. 그대로 생성하면 `approvalStatus?: ...`처럼
**모든 응답 필드가 `T | undefined`**가 되고, 화면마다 있지도 않은 `undefined` 검사를 하게 된다.
그래서 `codegen`에 `--properties-required-by-default`를 건다.

감수하는 것: **진짜 비어 있을 수 있는 필드도 `string`으로 보인다**(`BankAccountResponse.memo`,
`approvedAt` 같은 것). 스펙에 `nullable`도 없어서 코드젠이 구분할 방법이 없다. BE가 응답
record 필드에 `@Schema(nullable = true)`(또는 `requiredMode`)를 달아 주면 이 플래그를 뗀다.

### 스냅샷 출처

`openapi/wholesale.json`은 dev 서버(`api-dev.ddmondo.co.kr`)의 `/v3/api-docs`가 ALB에 막혀
있어서 BE에게 받은 파일로 만들었다(2026-09-04, `On도 도매 API 0.1.0`). 다음부터는
`sync-spec <파일>`로 갱신한다.

**소매 API 스펙은 아직 없다.** `apps/retail/src/shared/api/types.ts`의 손으로 적은 타입은
소매 스냅샷(`openapi/retail.json`)이 들어오면 같은 방식으로 바꾼다.
