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

**받은 쪽이 이겨서 초안 칸이 사라지면 멈춘다**(loop-05b). 기존 스키마에 FE가 칸을 더한 경우(예: `ChatAutoReply.choices`)
그 속성에 `"x-ondo-draft": true`를 붙여 둔다. BE가 같은 이름 스키마를 그 칸 없이 내면 `sync-spec`이 스냅샷을 쓰기 전에
`` `ChatAutoReply.choices` 사라짐 ``으로 멈춘다 — optional 칸이라 typecheck로는 안 잡힌다. 규칙은 `scripts/merge-drafts.mjs`,
시험은 `scripts/merge-drafts.test.mjs`(`pnpm test`가 돈다).

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
| HTTP | `POST /__mock/chat/rooms/{roomId}/incoming {body, count?, intent?, contextListingId?}` | 소매 메시지 주입. `contextListingId`가 있으면(숫자 또는 null) 방 문맥을 바꾸고 자동 답을 붙인다(count 1일 때만) |
| HTTP | `POST /__mock/chat/fail {op, status = 500, times = 1}` | op(`rooms` `room` `messages` `send` `read` `settings`)의 다음 n회 실패. `settings`는 설정 GET, PUT 공용 |
| HTTP | `POST /__mock/chat/reset {rooms?}` | 시드로(자동 답 설정은 켜짐, 방 1 문맥은 2001 지금). `rooms: 0`이면 빈 목록, `n`이면 최근 n개만 |
| HTTP | `POST /__mock/chat/rooms/{roomId}/context {listingId, ageMinutes = 0}` | 방 상품 문맥. `ageMinutes: 31`이면 지난 문맥, `null`이면 없음 (도매, 소매 공용) |

### 미송 자동 답과 소매 헤더 배지 (loop-06, #298)

판정은 `src/mocks/chat/inquiry.ts`의 미송 가지와 `src/mocks/chat/backorderCandidates.ts`(후보, 서울 날짜, 칩 글자,
본문 좁히기)다. 후보 원본은 도매 미송 목 저장소(`wholesale/backorder.ts` `inquiryBackorders()`)를 **거르지 않고**
넘기고, 이 방 도매처와 이 소매처 것만 고르는 건 판정이 한다. 원본에는 원래 수량, 판매가능, 소매처 이름 칸이 없다.
한 탭 안에서는 미송 탭의 입고일 저장과 배분이 다음 자동 답에 바로 쓰인다.

시드 날짜: 입고 예정일은 **reset 시각(서울) 기준 상대값**이다(3003 −3일, 3019 +7일, 3801 +5일, 3011 미정).
채팅 reset이 미송 목도 같이 되돌린다. e2e는 reset 전에 `page.clock`을 2026-10-29 14:20(+09:00)에 고정한다.
미송 시드 행: 9001 9002 9003 9005 9006(봄봄상회, 원래 4 남은 2) 9004(해소) 801(도매처 102, 방 33). 미송 탭은 도매처 101 것만 본다.

| 앱 | 손잡이 | 동작 |
|---|---|---|
| 도매 | `POST /__mock/chat/rooms/{roomId}/incoming {body, autoReply: true, inquiry?}` | 방 문맥을 안 바꾸고 판정을 돌린다. `inquiry`는 칩 주입(`{intent: BACKORDER, backorderId, variantId}`, `{notListed: true}`) |
| 도매, 소매 | `POST /__mock/chat/reset {noBackorders?}` | 미송 0건으로(후보 0개 시험) |
| 소매 | `POST /__mock/chat/reset {empty?}` | 내 방(봄봄상회) 0개 |
| 소매 | `POST /__mock/chat/fail {op: count, status}` | 헤더 배지 op `GET /api/retail/notifications/unread-count`의 다음 n회 실패 |
| 소매 | `POST /__mock/chat/delay {op: count\|read, ms, times = 1}` | 다음 n회 응답을 늦춘다. 값은 요청 시점에 정한다(늦은 count 시험) |

소매 `unread-count` = `{notifications, chats: 내 방 unreadCount 합, latestNotificationId}`. 06b부터 알림 몫은 소매 알림 목(아래 "소매 알림 목") 저장소를 읽는다. 시드는 2와 2022.
골든셋 v3(`openapi/golden/inquiry-golden.json`)은 재고 35 + 미송 24. 판정 unit이 전부, 소매 HTTP 테스트가 방 1 시나리오를 돈다.
| HTTP | `POST /__mock/chat/auto-reply {enabled, intents?}` | 자동 답 켜고 끄기. 소매 탭은 도매 탭 스위치와 상태를 나누지 않아 이걸로 맞춘다 (공용) |

계약 테스트는 `chat.test.ts`(vitest + `msw/node`, `pnpm test`가 돈다).

### 미수 자동 답과 넘김 이유 (loop-07, #301)

판정은 `src/mocks/chat/inquiry.ts`의 미수 가지(입금 알림 → 의도 둘 → 기간 말 → 조회 → 줄 → 이상값)와
`src/mocks/chat/receivable.ts`(`toReceivableFacts`, 문장 A B C D)다. 원본은 도매처 × 소매처 요약 한 줄
`{balance, unpaid, prepaid, overdue, exact, asOf}`이고 **거르지 않고** 넘긴다. 이 방 한 줄을 고르는 건 판정이 한다.
부호와 이상값 7종은 `toReceivableFacts` 한 곳에서만 보고, 하나라도 걸리면 금액 없이 넘긴다(`AMOUNT_UNSURE`).

- 원본: 도매처 101은 정산 목 장부(`wholesale/settlement.ts` `receivableSummary` 순수 함수, `mockReceivableRows`),
  102는 `chat/extraReceivables.ts`(봄봄상회 52,000원, 방 33). 부를 때마다 장부를 읽어 정산 탭 입금이 다음 답에 바로 쓰인다.
  소매 앱 번들엔 정산 핸들러가 없어 늘 시드 값이다(두 탭이 같은 시드와 같은 함수를 쓰는 것까지가 목의 보장)
- 답의 `checkedAt`은 원본 `asOf`(조회 시각)다. 판정 시각이 아니다
- 넘김 줄(도매 응답만)에 `handoff {reason, intent, sourceSequence}`. 소매 목은 이 칸을 싣지 않는다
- 열린 넘김 중 새 넘김: 이유가 같으면 줄 0, 다르면 새 줄(`linesToAppend`). 답 + 넘김 두 줄(재고 0, 미송 미정, 지남)은 늘 붙는다
- 채팅 reset이 주문, 출고, 정산 목도 같이 되돌린다(배정액이 주문 목에 있다)

| 앱 | 손잡이 | 동작 |
|---|---|---|
| 도매, 소매 | `POST /__mock/chat/fail {op: receivable, times = 1}` | 다음 n번 미수 원본 조회가 던진다. 보내기는 201, 답 대신 넘김(LOOKUP_FAILED) |
| 소매 | `POST /__mock/chat/payment {amount, allocations?: [{orderId, amount}]}` | 봄봄상회의 도매처 101 장부에 입금. 소매 화면에서 미수 답 C(전액 배분), D(남는 선수금)를 본다. 배분이 미수를 넘으면 400 |

골든셋 v4는 v3 59 + 미수 18(P5, R01~R17) + 넘김 7(H16~H22) = 84. v4 몫(`since: 4`)의 expect는 방에 **들어간 줄** 투영이다.
`receivables` 표 7행과 `receivableAnomalies` 이상값 표 9행이 같이 있다.

### 문의 지표와 상대 읽음 (loop-08, #311)

초안 op `inquiryStats` `GET /api/wholesale/chat/inquiry-stats?from&to`. 집계는 `src/mocks/chat/inquiryStats.ts` 순수 함수
`inquiryStats(rooms, {wholesalerId, from, to, asOf})`이고 **BE 규칙 원본**이다. 기대값은 `chat/inquiryStats.fixture.ts`
(F1~F17) 표를 손으로 센 숫자다(`chat/inquiryStats.test.ts`). BE는 같은 표로 자기 테스트를 맞춘다.

- 소매 TEXT 1개 = 결과 1개. 자동 답 > 넘김 > 되묻기 > 결과 없음. 같은 출처에 답 + 넘김이면 `autoRepliedWithHandoff`
- 영업일 D = [D 12:00, D+1 12:00) KST, 출처 `sentAt` 기준. `asOf`(요청 시각) 뒤에 쓰인 줄은 안 센다
- `startAt` `endAt` `asOf`는 `+09:00` 오프셋으로 낸다(보고서에 그대로 옮긴다)

| 앱 | 손잡이 | 동작 |
|---|---|---|
| 도매 | `POST /__mock/chat/reset {seed: "stats-v1"}` | 기본 시드 **대신** fixture F1~F12, F14~F16(방 1 = 101 x 봄봄상회, 방 2 = 102). 다른 seed 이름은 400 |
| 도매 | `POST /__mock/chat/fail {op: stats, status}` | 지표 op 다음 n회 실패(500, 404 …) |
| 도매, 소매 | `POST /__mock/chat/rooms/{roomId}/counterpart-read {sequence}` | 상대가 여기까지 읽었다. 내려가지 않는다(작은 값은 무시), 방에 없는 sequence 400 |
| 도매 | `POST /__mock/chat/delay {op: room\|messages, ms, times = 1}` | 다음 n회 응답을 늦춘다. 값은 요청 시점에 정한다(늦은 방 머리 시험) |
| 소매 | `POST /__mock/chat/delay {op: count\|read\|room\|messages\|rooms, ...}` | 06a 의 count, read 에 셋을 더했다 |
| 소매 | `POST /__mock/chat/reset {rooms: n}` | 내 방 n개(2~200) = 시드 방 1, 33 + 가짜 방(도매처 1001 …). 방 목록은 이제 실제 keyset cursor(도매 목과 같은 정렬, 잘못된 cursor 400) |

### 방 목록 필터와 검색 (loop-08b, #326)

초안 쿼리 `chatRooms?filter=UNREAD|NEEDS_REPLY&q=`(op 는 그대로, 쿼리 둘에 `x-ondo-draft`). 순서는 내 방 → 조건 → 정렬 → cursor.
`q`는 소매처 이름 부분 일치, 앞뒤 공백 지움(비면 조건 없음), 안쪽 공백 그대로, 영문 대소문자만 무시, 지운 뒤 50자 넘으면 400.
`filter=`(빈 값)는 없는 것과 같다. BE 가 `chatRooms`를 먼저 내면서 두 쿼리를 빼면 `sync-spec`이 멈춘다(`checkDraftSurvival` 4번).
계약 테스트는 `chatRoomsFilter.test.ts`.

| 앱 | 손잡이 | 동작 |
|---|---|---|
| 도매 | `POST /__mock/chat/reset {seed: "rooms-70"}` | 기본 시드 **대신** 내 방 70개(roomId 100 + i, "소매처 i", i 작을수록 최근). 홀수 안 읽음(자동 답이 답해 답 필요 아님) 35, 4의 배수 답 필요 17, 나머지 18. 남의 방 171(도매처 102, "소매처 6") |
| 도매 | `POST /__mock/chat/delay {op: rooms\|send, ms, times = 1}` | 08a 의 room, messages 에 둘을 더했다. `rooms`는 값을 정한 뒤 늦게 도착, `send`는 저장한 뒤 응답만 늦다(기본 300ms 위에 더함) |

## 알림 목 (`src/mocks/wholesale/notification.ts`, #290)

초안 op 3개(도매 `notifications` `notificationUnreadCount` `markNotificationsRead`). BE 코드가 없어 시드를 여기서 지었다.

- 시드 25개: NEW_ORDER 22, ORDER_CANCELLED 2, 스펙 밖 type `PAYMENT_RECEIVED` 1. 안 읽음 3(1, 2, 22번째). 21, 22번째 createdAt 같음. 시각은 reset 시점 기준 어제~3일 전
- 정렬 createdAt desc → id desc, cursor는 base64 `ms|id` keyset이라 페이지 사이 신규 삽입에 중복, 누락이 없다
- `chatsNeedingReply`는 채팅 목의 `needsReply`(`chatsNeedingReplyCount`)를 그때 읽는다. 따로 세지 않는다
- 새 주문은 주문 목(`addMockOrder`)에 실제로 넣는다. 시드 뒤 첫 주문은 7006

| 종류 | 이름 | 동작 |
|---|---|---|
| HTTP | `POST /__mock/notifications/incoming {type = NEW_ORDER, orderId?}` | orderId 없으면 주문 목에 신규 주문(봄봄상회, 빈티지 플라워 셔츠 레드 / M 1장, 지금) + 알림. `ORDER_CANCELLED + orderId`는 그 주문 취소 + 알림. 없는 orderId 400, 신규 아닌 주문 취소 409. 응답 `{data: {notification, orderId}}` |
| HTTP | `POST /__mock/notifications/fail {op, status = 500, times = 1}` | op(`list` `count` `read`)의 다음 n회 실패. read 실패는 읽음을 바꾸지 않는다 |
| HTTP | `POST /__mock/notifications/delay {op, ms, times = 1}` | 다음 n회 응답을 ms만큼 늦춘다. 값은 요청 시점 것이라 "먼저 시작한 count가 read 뒤 옛 숫자로 도착"을 만든다 |
| HTTP | `POST /__mock/notifications/reset {empty?}` | 시드로, fail과 delay 해제. `empty: true`면 0개. 주문 목, 채팅 목은 안 건드린다 |

계약 테스트는 `notification.test.ts`, 초안 소실 검사는 `scripts/merge-drafts.test.mjs`의 S10-1.
count 의 초안 칸 `latestNotificationId`(loop-06b)는 목록 첫 행 id다. 알림이 없으면 null.

### 소매 알림 목 (`src/mocks/retail/notification.ts`, loop-06b #304)

초안 op 2개(소매 `notifications` `markNotificationsRead`). 도매 알림 목의 복제이고 다른 점은 소매 오류 어휘, target 갈래
(`{kind: ORDER, orderId}` | `{kind: BACKORDERS, wholesalerId}`), read `ids` 중복 400이다. `unread-count`는 06a 채팅 목 핸들러가
이 저장소를 읽는다(`retailNotificationCount`). 소매 worker(`startRetailChatWorker`)가 채팅과 같이 올린다.

- 시드 22개: 입고일 변경 8, 주문 확정 6, 미송 배분 4, 출고 3, 스펙 밖 type `PAYMENT_DUE` 1. 안 읽음 2(1, 21번째). 20, 21번째 createdAt 같음. 5, 6번째 id가 가장 크다(2030, 2031)
- 입고일 변경 규칙은 순수 함수 `src/mocks/retail/dateChangeNotice.ts` `dateChangeNotifications`. **BE가 옮길 규칙이 여기 있다**(날짜가 바뀔 때만, OPEN 미송 소매처마다 남은 합으로 1건)
- 입고일 주입은 미송 목(`wholesale/backorder.ts`)을 도매 PUT과 같은 `replaceExpectedInbound`(전체 대체)로 바꾼다. 그래서 그 뒤 채팅 미송 답도 새 날짜를 쓴다

| 종류 | 이름 | 동작 |
|---|---|---|
| HTTP | `POST /__mock/notifications/incoming {type: BACKORDER_DATE_CHANGED, variantId, expectedInboundDate (null 가능), expectedInboundReason?}` | 미송 목 그 SKU 전체 대체 + "나"(봄봄) 몫 알림. 날짜가 같으면 0건. 응답 `{data: {created, notifications}}` |
| HTTP | `POST /__mock/notifications/incoming {type: ORDER_CONFIRMED \| SHIPPED, orderId}`, `{type: BACKORDER_ALLOCATED, orderId, qty}` | ORDER target 알림 1건. 주문 상태는 안 바꾼다(stub 몫). 모르는 type, 없는 variantId, orderId 없음 400 |
| HTTP | `POST /__mock/notifications/fail {op: list\|read, status = 500, times = 1}` | count 는 06a `/__mock/chat/fail {op: count}` |
| HTTP | `POST /__mock/notifications/delay {op: list\|read, ms, times = 1}` | count 는 06a `/__mock/chat/delay {op: count}` |
| HTTP | `POST /__mock/notifications/reset {empty?}` | 시드로, fail과 delay 해제. 미송, 채팅 목은 `/__mock/chat/reset`이 되돌린다 |

계약 테스트는 `retail/notification.test.ts`, 규칙 unit 은 `retail/dateChangeNotice.test.ts`, 초안 소실 검사는 `scripts/merge-drafts.test.mjs`의 loop-06b S1-1
(op 2, target `oneOf` 갈래, `latestNotificationId` 소실을 가짜 스펙으로).

### 재고 문의 자동 답 (loop-05b)

소매 보내기(`retail/chat.ts`)와 도매 `incoming` 주입이 **같은 판정 함수**를 부른다.

| 파일 | 하는 일 |
|---|---|
| `src/mocks/chat/inquiry.ts` | 판정 순서 0~9와 문장. 순수 함수(msw, 저장소, 시계 없음). **BE가 옮길 규칙이 여기 있다** |
| `openapi/golden/inquiry-golden.json` | 골든셋 35 시나리오 + 정규화 표 6행 + 재고 표. 목 unit과 BE 테스트가 같은 파일을 읽는다. `sync-spec`은 이 폴더를 건드리지 않는다 |
| `src/mocks/chat/extraListings.ts` | 채팅 목 전용 게시글 2901(게시 옵션 1개), 2902(게시 옵션 0개). 상품 화면엔 없다 |
| `src/mocks/chat/golden.testkit.ts` | 골든셋 읽기 도구. 테스트만 import 한다(골든셋 글자가 앱 번들에 실리면 안 된다) |

- 재고 값은 상품 목 시드를 읽기만 한다(`wholesale/product.ts` `chatStockListing`). 채팅이 재고를 바꾸지 않는다
- 소매 응답에는 정확 수량이 없다: facts는 `band` `orderLimit` `orderable`만, 본문과 label은 구간 글자만
- 열린 넘김이 있으면 넘김 줄을 또 넣지 않는다(`generation: NONE`). 재고 답은 그래도 붙는다
- 자동 답 설정(초안 op `autoReplySettings` `updateAutoReplySettings`)은 도매 목 저장소에 한 벌. 새로고침하면 켜짐
- 계약 테스트: `chat/inquiry.test.ts`(골든셋을 순수 함수로), `retail/chat.test.ts`(같은 골든셋을 HTTP로, 누출, 멱등, 설정 왕복)
