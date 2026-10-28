# @ondo/api

도매·소매 API를 **부르는 방법**만 담는다. 화면도, 도메인 판단도 여기 두지 않는다.

## 스펙은 서버에만 있다

백엔드(`ondo-commerce/ondo-api`)는 `openapi.yaml` 파일을 커밋하지 않는다. 스펙은
springdoc이 코드에서 만들어 **런타임에만** 존재한다 — `GET :8081/v3/api-docs`.

그런데 CI와 Vercel 빌드에는 그 서버가 없다. 그래서 명령을 둘로 갈랐다.

| 명령 | 서버 | 하는 일 |
|---|---|---|
| `pnpm --filter @ondo/api sync-spec <wholesale\|retail> [파일\|URL]` | **필요** | 스펙을 받아 키를 정렬해 `openapi/<app>.json`에 굳히고, 이어서 `codegen` |
| `pnpm codegen` | 불필요 | 커밋된 스냅샷 두 개 → `src/generated/`. 결정적이라 CI가 drift를 잡을 수 있다 |

첫 인자가 앱이다 — 서버가 둘(도매 `:8081` · 소매 `:8080`)이라 스냅샷도 둘이고, 어느 쪽인지
짐작하면 도매 파일에 소매 스펙을 덮어쓴다.

**BE가 스펙을 바꿨다고 알려오면 `sync-spec`을 돌린다.** 스냅샷과 생성물을 한 커밋에 올린다.
CI가 잡아주는 건 "스냅샷 ↔ 생성물"까지다 — **서버와 스냅샷이 어긋나는 건 사람만 막을 수 있다.**

### 초안 op — `openapi/drafts/<app>.json`

BE가 아직 없는 op를 FE가 먼저 쓸 때(FE-only 모드)는 스냅샷에 손으로 넣되 op에
`"x-ondo-draft": true`를 붙이고, 같은 조각(`paths` · `components.schemas`)을 `openapi/drafts/<app>.json`에
둔다. `sync-spec`은 받은 스펙으로 스냅샷을 **통째로 덮은 뒤** drafts에 있고 받은 스펙에 없는 초안 op와
그 op가 참조하는 스키마만 다시 합친다. 받은 스펙에 같은 경로·메서드가 있으면 받은 쪽이 이긴다 —
BE가 구현했다는 뜻이니 그 커밋에서 drafts 조각을 지운다(스크립트가 `초안 폐기:`로 알려 준다).
초안 표시가 없는 op가 drafts에 있으면 스크립트가 멈춘다.

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

dev 서버(`api-dev.ddmondo.co.kr`)의 `/v3/api-docs`는 ALB가 `/api/*` 밖 경로를 끊어서 못 받는다.
그래서 둘 다 서버 밖에서 만들었다.

- `openapi/wholesale.json` — BE에게 받은 파일 (2026-09-04, `On도 도매 API 0.1.0`)
- `openapi/retail.json` — `ondo-api` `dev` 브랜치의 `retail-api`를 로컬(JDK 21 + Postgres 16)에서
  띄워 `:8080/v3/api-docs`를 받은 것 (2026-09-05, `On도마켓 소매 API v1`, 17 path · 69 schema).
  도매 서버 없이도 뜬다 — 상품·미송 호출은 요청 시점에만 도매로 나간다

다음부터는 `sync-spec <app> <파일>`로 갱신한다. 소매 앱은 `RetailSchema<"…">`로 쓴다.

## 채팅 목 (`src/mocks/wholesale/chat.ts`, #263)

초안 op 11개(도매 5 `/api/wholesale/chat/*`, 소매 6 `/api/retail/chat/*`) 가운데 **도매 5개만 목이 있다.**
소매 목은 loop-05(S5)에 만든다. 그때 지킬 것:

- **방 id 체계는 하나다.** 방은 (도매처, 소매처) 사업체 쌍에 1개이고 도매와 소매가 같은 `roomId`를 본다.
  소매 목은 도매 목의 방 저장소를 같이 써야 한다(따로 시드를 만들면 양쪽 roomId가 갈린다).
  지금 시드: 도매처 101의 방 1~32(소매처 id = 방 번호, 1 봄봄상회, 2 대기상회는 주문, 미송 목과 같은 id),
  도매처 102와 봄봄상회의 방 33(101에게는 404). 소매 세션의 "나"는 봄봄상회(1)로 두면 방 1과 33이 보인다.
- `createChatRoom`(POST `/api/retail/chat/rooms`)은 쌍이 이미 있으면 그 방을 200으로, 없으면 다음 번호로 201.
- `sequence`, 읽음(`max`), `Idempotency-Key` 규칙은 도매와 같다. 키 범위는 (방, 보낸 사업체)라
  저장소 키에 보낸 쪽을 넣는다(`${roomId}:RETAILER:${key}`).

손잡이(목 전용, 스펙에 없음):

| 종류 | 이름 | 동작 |
|---|---|---|
| 본문 | `auth401` / `auth403` | 401 `UNAUTHENTICATED` / 403 `NOT_APPROVED`, 만들지 않음 |
| 본문 | `fail500` | 늘 500, 만들지 않음 |
| 본문 | `fail500once` | 그 키의 첫 요청만 500, 다시 보내면 201 |
| 본문 | `failAfterCommit` | 만들고 응답만 500. 같은 키로 다시 보내면 200 replay |
| 본문 | `slow5s` | 만든 뒤 5초 있다가 201 (기본은 300ms) |
| HTTP | `POST /__mock/chat/rooms/{roomId}/incoming {body, count?, intent?}` | 소매 메시지 주입 |
| HTTP | `POST /__mock/chat/fail {op, status = 500, times = 1}` | op(`rooms` `room` `messages` `send` `read`)의 다음 n회 실패 |
| HTTP | `POST /__mock/chat/reset {rooms?}` | 시드로. `rooms: 0`이면 빈 목록, `n`이면 최근 n개만 |

계약 테스트는 `chat.test.ts`(vitest + `msw/node`, `pnpm test`가 돈다).
