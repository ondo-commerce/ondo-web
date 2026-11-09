# 12. 시연 사용 가이드 (평가위원용)

외부 평가위원이 공개 URL에 테스트 계정으로 들어와 직접 써 보는 순서다. 2026-11 최종점검 보고서에 이 문서의 URL, 계정 자리, 화면 순서를 옮긴다.

## 1. 공개 URL

| 앱 | 주소 | 누가 쓰나 |
|---|---|---|
| 도매 ERP (온도 ERP) | https://pos.ddmondo.co.kr | 동대문 도매 사장 |
| 소매 마켓 (온도 마켓) | https://ddmondo.co.kr | 소매 사장 |

로그인 없이 열면 두 앱 모두 로그인 화면으로 간다. preview 주소(`*.vercel.app`)는 소매가 SSO로 잠겨 있어 쓰지 않는다.

## 2. 테스트 계정

| 앱 | 로그인 이메일 | 비밀번호 |
|---|---|---|
| 도매 | `raon@ondo.test` | 운영자에게 받는다 |
| 소매 | `bombom@ondo.test` | 운영자에게 받는다 |

로그인 칸은 이메일이다. 두 계정 모두 승인 완료 상태인 dev 시드 계정이다(도매 V901, 소매 seed). 비밀번호는 이 문서와 소스에 적지 않는다. 같은 계정을 여러 명이 동시에 쓰면 세션이 풀린다(2026-09-18 실측: 같은 계정의 다른 로그인에 풀림). 평가위원이 동시에 들어오면 계정을 따로 준다(기획 Q6).

## 3. 볼 화면 순서

### 도매 (pos.ddmondo.co.kr)
1. 대시보드: 로그인하면 바로 여기로 온다. 확정 대기 주문, 미송, 미수 요약
2. 주문: 들어온 소매 주문을 확정한다
3. 출고: 확정한 주문을 포장, 출고한다
4. 미송: 재고가 모자라 못 보낸 수량
5. 재고: 품목별 현재고와 입고
6. 상품: 상품 목록과 등록(`/products/new`)
7. 정산: 소매처별 미수, 입금 등록, 정산 계좌

### 소매 (ddmondo.co.kr)
1. 홈: 도매처들이 올린 상품 목록
2. 검색: 상품 이름으로 찾기
3. 장바구니: 담은 상품을 도매처별로 묶어 본다
4. 주문: 주문서 작성과 주문 내역, 주문 상세(장끼 보기)

5분 체험 경로: 소매에서 주문 접수 → 도매 주문 탭에서 확정 → 소매 주문 상세에서 상태가 바뀐 것 확인.

도매에서 확정할 때는 주문을 펼쳐 이번 출고 칸에 수량을 적고 확정한다(비우면 재고가 있어도 전량 미송이 된다).

## 4. 누르면 공개 데이터가 바뀌는 것

공개 계정은 평가위원 모두가 같은 데이터를 본다. 아래를 누르면 서버 데이터가 바로 바뀌고, 화면에서 되돌리는 버튼은 없다. 5분 체험 경로도 주문 접수와 확정을 쓰므로 한 번 돌면 데이터가 바뀐다.

| 앱 | 화면 | 누르는 것 | 무엇이 바뀌나 |
|---|---|---|---|
| 소매 | 장바구니, 주문서 | 주문하기 | 새 주문이 생기고 도매 확정 대기가 1 는다 |
| 소매 | 주문 상세 | 주문 취소 | 누르지 않는다. BE가 목 응답이라 "취소 실패"가 섞여 나오고 상태는 그대로다 |
| 도매 | 주문 | 주문 확정, 거절 | 확정 대기가 준다. 이번 출고 칸에 적은 수량은 출고 탭 포장 대기로, 나머지는 미송으로 간다 |
| 도매 | 출고 | 출고 처리 | 출고 대기가 줄고 소매 미수와 장끼가 생긴다 |
| 도매 | 재고 | 입고 | 현재고가 바뀌고 미송 배분이 달라진다 |
| 도매 | 상품 | 등록, 수정, 삭제 | 소매 홈 상품 목록이 바뀐다. 삭제하면 게시글까지 사라진다 |
| 도매 | 정산 | 입금 등록, 입금 취소, 선수금 정산 | 소매처 미수와 선수금이 바뀐다 |
| 도매 | 정산 | 정산 계좌 등록, 삭제 | 소매 정산 화면의 입금 계좌 안내가 바뀐다 |

다시 체험하려면: 같은 경로를 처음부터 다시 돌면 된다. 주문을 새로 넣으면 확정 대기가 다시 생긴다. 재고나 미송이 바닥나 더 확정할 수 없거나 데이터가 어지러워지면 운영자에게 초기화를 요청한다. 운영자는 BE에 공개 시드 리셋(기획 BE 요청 B3, 리셋 SQL)을 부탁한다. 리셋 SQL이 준비되기 전에는 초기화가 수작업이라 시간이 걸린다.

## 5. 알려진 제약

| 무엇 | 지금 상태 | 왜 |
|---|---|---|
| 상품 이미지 업로드 | 업로드 칸이 실패하거나 "준비 중"으로 보인다 | 업로드 API가 BE에 아직 없다 |
| 채팅 | 공개 주소에서는 아직 못 쓴다 | 서버 구현됨(2026-11-08~09), 배포 대기. 로컬 실서버로 장면 1~3 확인(2026-11-09) |
| 도매 가입, 재신청 | 폼은 보이지만 제출이 잠겨 있다 | 서류 업로드 API가 없다. 체험은 테스트 계정으로 |
| 비밀번호 찾기, 문의하기 | 문의 안내 한 줄만 나온다 | 메일 발송 경로가 없다 |
| 소매 설정 | 상호와 이메일만 보이고 고칠 수 없다 | 설정 수정 API가 없다 |
| 소매 주문 취소 | 누르지 않는다 | BE가 목 응답이라 상태가 안 바뀐다 |
| 로그인 | 2026-11-09 기준 api, api-dev 주소가 DNS에서 안 풀려 소매 ddmondo.co.kr이 500 | 서버 배포 복구 전에는 로그인 뒤 화면을 볼 수 없다 |

## 6. 점검 자동화

공개 URL을 실제로 열어 보는 스모크 테스트가 있다. CI에서는 돌지 않는다.

```bash
pnpm e2e:public:anon            # 로그인 없이 볼 화면만
PUBLIC_PW=… pnpm e2e:public     # 로그인 뒤 18화면까지. 비밀번호가 없으면 실패한다
```

- 설정 `playwright.public.config.ts`, 테스트 `e2e/side-02/public/`
- 로그인 없이: 보호된 화면이 전부 `/login`으로 가는지, 로그인·가입·로그아웃 안내 화면과 다이얼로그에 금칙어("준비 중", "Placeholder", "TODO", "예시 값", "서버가 없어요", 더미 상호, 영문 404)가 없는지 본다
- 금칙어는 보이는 글자 전부에서 센다. 빼는 것은 둘뿐이다: 글자 전체가 "준비 중"인 주문·출고 상태 배지(진짜 상태 이름), 상품 등록의 "이미지 업로드는 준비 중이에요"(업로드 API 대기, BE #280)
- 로그인 뒤: 앱마다 한 번 로그인하고 그 세션(`e2e/.auth/`, git에 안 올라간다)을 재사용한다. 로그인이 실패하면 그 앱 점검은 돌지 않는다. 이메일은 위 계정이 기본값이고 `PUBLIC_W_EMAIL`, `PUBLIC_R_EMAIL`로 바꾼다
- 실패해도 비밀번호가 남지 않게 trace를 끄고, 실패한 로그인 칸은 비운 뒤 실패시킨다
- 다른 주소를 보려면 `PUBLIC_BASE_W`, `PUBLIC_BASE_R`

## 7. 발표자용 장면 1 (목 모드)

평가위원용이 아니라 발표 노트북용이다. 장면 1은 "소매가 채팅으로 재고를 묻고 → 자동 답 → 담고 → 주문 → 도매가 알림으로 그 주문을 연다"다. BE 없이 목(MSW)으로 돌리고, 같은 순서가 e2e `e2e/loop-05b2-notify-read/wholesale-scene1.spec.ts`(도매 절반), `e2e/loop-05b-stock-reply/scene1-retail.spec.ts`(소매 절반)에 있다.

준비(탭 2개):

```bash
# 터미널 1 — 도매(목). 브라우저 탭 A: http://localhost:3000/login, 아무 이메일로 로그인
NEXT_PUBLIC_API_MOCK=1 pnpm --filter wholesale dev
# 터미널 2, 3 — 소매(가짜 API 3199 + 목). 브라우저 탭 B: http://localhost:3001
node --no-warnings e2e/side-02/retail/stub-server.ts
NEXT_PUBLIC_API_MOCK=1 API_ORIGIN=http://localhost:3199 pnpm --filter retail exec next dev -p 3001
```

목 저장소는 탭마다 따로다. 새로고침하면 그 탭의 목이 시드로 돌아간다. 도매 탭 안에서는 주 메뉴로만 옮긴다(주소창 이동도 새로고침이다).

초기화(도매 탭 콘솔, 한 줄씩):

```js
await fetch("/__mock/chat/reset",{method:"POST",body:"{}"})
await fetch("/__mock/notifications/reset",{method:"POST",body:"{}"})
```

순서:

1. 소매 탭 B: 빈티지 플라워 셔츠 상세 → `재고 문의` → 되묻기 칩 → 자동 답 카드 → 장바구니 담기(05b-1 소매 절반)
2. 도매 탭 A `/chats`: 소매 문의가 도매 목에 닿지 않으므로 같은 문의를 넣는다. 방 6(라온상점)에 재고 문장 + 상품 문맥

   헤더 채팅(답 필요 n건)을 누르면 답 필요 목록이 먼저 뜬다 → 칩 `전체` → 라온상점

   ```js
   await fetch("/__mock/chat/rooms/6/incoming",{method:"POST",body:JSON.stringify({body:"레드 M 몇 장 있어요",contextListingId:2001})})
   ```

   자동 답 말풍선과 근거 칸("판매가능 35장, 주문 한도 500장")을 보여 준다. 소매에게 나간 보기를 보여 주려면 옵션 없이 먼저 묻는다 — 되묻기 말풍선에 "보기: 레드 / S, 레드 / M, …" 한 줄이 생긴다(누를 수 없는 글자)

   ```js
   await fetch("/__mock/chat/rooms/6/incoming",{method:"POST",body:JSON.stringify({body:"이 셔츠 몇 장 남았어요?",contextListingId:2001})})
   ```
3. `자동 답변` 스위치를 끄고 위 명령을 한 번 더 → 가운데 넘김 줄. 30초 안에 헤더 채팅 배지가 1 오른다
4. 스위치를 다시 켠다. 주 메뉴 `상품`으로 옮긴다
5. 새 주문(소매 주문 접수 대신):

   ```js
   await fetch("/__mock/notifications/incoming",{method:"POST",body:JSON.stringify({type:"NEW_ORDER"})})
   ```

   30초 안에 헤더 종 배지 3 → 4
6. 종 → 맨 위 "봄봄상회 새 주문 · 방금" → 주문 탭으로 가서 그 주문(7006)이 펼쳐지고 우측 카드 `신규 주문`. 종 배지 4 → 3

BE 모드와 다른 점:

| | 목 모드(지금) | BE 모드(BE 알림 구현 뒤) |
|---|---|---|
| 소매 주문 → 도매 | 소매 탭의 주문 접수가 도매에 안 닿는다. 5번 주입이 대신한다. "주문 접수는 실서버에서 이어진다"고 말한다 | 소매 주문 커밋이 알림을 만든다. 주입 없음 |
| 소매 문의 → 도매 채팅 | 2번 주입이 대신한다 | 같은 방에 바로 보인다 |
| 초기화 | 위 reset 두 줄, 또는 새로고침 | 운영자가 시드 리셋 |

소매 헤더의 "답 왔음" 배지(장면 1의 8단계)는 아직 없다. loop-06(#297)에서 소매 알림과 같이 붙는다.

## 8. 발표자용 장면 2 (화면 계약 시연)

장면 2는 "소매가 채팅으로 미송이 언제 오냐고 묻고 → 자동 답 → 도매가 입고일을 바꾸면 → 소매 헤더 종에 알림 → 누르면 미송 화면에 새 날짜 → 다시 물으면 새 날짜"다. 같은 순서가 e2e `e2e/loop-06b-retail-notify/scene2-retail.spec.ts` 한 파일에 있다(도매 탭 + 소매 탭).

알림 생성 연동은 아직 아니다. 도매 저장이 소매 알림을 만드는 게 아니라, 소매 탭에 같은 결과를 주입해서 보여 준다. "도매 저장 → 소매 알림"은 BE 알림 구현 뒤 실서버에서 이어진다고 말한다.

날짜: 오늘을 R이라 하면 린넨 셋업 자켓 베이지/L(3019)의 지금 입고일은 R+7, 바꿀 날짜 D는 R+10이다. 아래 `D`는 그날 날짜로 바꿔 친다(도매 칸은 `YYYY.MM.DD`, 주입은 `YYYY-MM-DD`).

준비(탭 2개, 장면 1과 같은 서버 셋):

```bash
# 터미널 1 — 도매(목). 탭 A: http://localhost:3000/login, 아무 이메일로 로그인
NEXT_PUBLIC_API_MOCK=1 pnpm --filter wholesale dev
# 터미널 2, 3 — 소매(가짜 API 3199 + 목). 탭 B: http://localhost:3001
node --no-warnings e2e/side-02/retail/stub-server.ts
NEXT_PUBLIC_API_MOCK=1 API_ORIGIN=http://localhost:3199 pnpm --filter retail exec next dev -p 3001
```

초기화. 도매 탭 A 콘솔:

```js
await fetch("/__mock/chat/reset",{method:"POST",body:"{}"})
```

소매 탭 B 콘솔. 블록 두 개를 따로 붙여 넣는다. 먼저 봄봄상회로 들어가기(새로고침된다):

```js
document.cookie="stub_retailer=bombom; path=/"; location.reload()
```

새로고침이 끝난 뒤 채팅 목, 알림 0개(같이 붙여 넣으면 reset이 새로고침 전 페이지에서 돌고, 새로고침이 목을 시드 알림 22개로 되돌린다):

```js
await fetch("/__mock/chat/reset",{method:"POST",body:"{}"})
await fetch("/__mock/notifications/reset",{method:"POST",body:JSON.stringify({empty:true})})
```

터미널(가짜 API의 미송 표를 시드로):

```bash
curl -X POST http://localhost:3199/__stub/reset
```

목은 탭마다 따로고 새로고침하면 시드로 돌아간다. 초기화한 뒤에는 헤더와 메뉴로만 옮긴다.

순서:

1. 소매 탭 B: 도매 답 주입 → 30초 안에 헤더 채팅 배지 +1

   ```js
   await fetch("/__mock/chat/rooms/1/incoming",{method:"POST",body:JSON.stringify({body:"네 내일 오전에 주문 넣어 주시면 바로 챙길게요"})})
   ```
2. 헤더 `채팅` → 무드온 방 → "지난주 주문한 거 언제 와요?" → 보기 4개 → 린넨 셋업 자켓 → 카드 "도매 입고 예정 {R+7}"
3. 도매 탭 A: 주 메뉴 `미송` → SKU 1-2 펼치기 → 예상 입고일에 D, 변동 사유 "원단 수급 지연" → 폼 아래 "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요" → `저장` → "저장했어요"
4. 소매 탭 B: 로고로 홈. 종 배지 없음을 보여 주고 주입 둘(도매 저장 대신)

   ```js
   await fetch("/__mock/notifications/incoming",{method:"POST",body:JSON.stringify({type:"BACKORDER_DATE_CHANGED",variantId:3019,expectedInboundDate:"D",expectedInboundReason:"원단 수급 지연"})})
   ```

   ```bash
   curl -X POST http://localhost:3199/__stub/backorders/eta -H 'Content-Type: application/json' -d '{"variantId":3019,"expectedInboundDate":"D"}'
   ```
5. 30초 안에 종 배지 1 → 종 → 맨 위 "무드온 미송 입고일 변경", "린넨 셋업 자켓 베이지/L 남은 2장, {R+7} → {D}", "방금"
6. 그 행 → 미송 화면(무드온 칩 켜짐), 린넨 셋업 자켓 줄 예상 입고일 D. 종 배지 사라짐
7. 헤더 `채팅` → 무드온 방 → 같은 질문 → 린넨 셋업 자켓 → "{D} 도매 입고 예정이에요(원단 수급 지연)"

BE 복귀 뒤 확인(목 모드로는 못 본다):

- [ ] 도매에서 3019 입고일 저장 → 소매 실서버 종 count +1(주입 없이)
- [ ] 그 알림 행 본문의 날짜가 "{옛 날짜} → {저장한 날짜}"
- [ ] 사유만 바꿔 저장하면 알림 0건

## 9. 발표 노트북 점검표

발표 당일 노트북에서 확인할 것. 기본은 운영 주소로 시연한다. 운영 서버가 안 뜨면 아래 "로컬 실서버로 시연"으로 바꾼다.

### 운영 주소로 시연할 때

- [ ] 1절 운영 주소 두 개로 시연한다. 소매 preview 주소(`*.vercel.app`)는 SSO로 잠겨 있어 쓰지 않는다
- [ ] 로컬로 띄워야 하면 앱마다 `.env.local`의 `NEXT_PUBLIC_API_MOCK`를 먼저 본다. 도매 `.env.development`는 `NEXT_PUBLIC_API_MOCK=1`이라 그대로 띄우면 목으로 뜬다
- [ ] 브라우저 프로필을 둘 쓴다. 하나는 도매, 하나는 소매. 두 앱의 로그인 세션을 나눈다
- [ ] 휴대폰 핫스팟을 예비로 켜 둔다. 행사장 와이파이가 막히면 바꾼다
- [ ] 시작 5분 전에 두 주소를 한 번씩 연다. 오래 쉬던 서버는 첫 요청이 느리다
- [ ] 11-26 사전 시연 테스트 때 6절 스모크를 한 번 돌린다. 두 스크립트가 `PUBLIC_SMOKE=1`을 붙여 production을 본다

```bash
pnpm e2e:public:anon            # 로그인 없이
PUBLIC_PW=… pnpm e2e:public     # 로그인 뒤까지
```

### 운영 서버가 안 뜰 때: 로컬 실서버로 시연

API 서버 두 개와 웹 두 개를 노트북에서 띄운다. 2026-11-10에 이 구성으로 소매 주문, 도매 확정, 소매 상태 변경까지 확인했다.

준비물:

- PostgreSQL 16이 5432에 떠 있고 `ondo_wholesale`, `ondo_retail` DB에 시드가 들어 있다(2절 계정으로 로그인된다)
- JDK 21
- 서버 코드 `~/dev/ondo-api`

API 서버(터미널 둘):

```bash
# JDK 21이 기본이 아니면 먼저
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

# 터미널 1: 도매 API, 8081
cd ~/dev/ondo-api/wholesale-api
./gradlew bootRun --args='--spring.profiles.active=local,dev'

# 터미널 2: 소매 API, 8080
cd ~/dev/ondo-api/retail-api
./gradlew bootRun --args='--spring.datasource.url=jdbc:postgresql://localhost:5432/ondo_retail'
```

웹을 띄우기 전에 3000, 3001 포트가 다른 프로젝트에 잡혀 있지 않은지 본다. 아무것도 안 나와야 한다.

```bash
lsof -iTCP:3000 -sTCP:LISTEN
lsof -iTCP:3001 -sTCP:LISTEN
```

잡혀 있으면 그 프로젝트를 끄거나 아래 `-p`를 3010, 3011로 바꾼다. 웹 요청은 같은 주소의 프록시로 가서 포트를 바꿔도 된다.

웹(터미널 둘, 레포 루트에서):

```bash
# 터미널 3: 도매 웹 http://localhost:3000
cd apps/wholesale && API_ORIGIN=http://localhost:8081 NEXT_PUBLIC_API_MOCK=0 pnpm exec next dev -p 3000

# 터미널 4: 소매 웹 http://localhost:3001
cd apps/retail && API_ORIGIN=http://localhost:8080 NEXT_PUBLIC_API_MOCK=0 pnpm exec next dev -p 3001
```

- [ ] 명령줄의 `NEXT_PUBLIC_API_MOCK=0`이 `.env.development`의 `=1`보다 먼저다. 브라우저 개발자 도구 Application 탭에서 service worker가 0개면 목이 꺼진 것이다
- [ ] 2절 계정으로 두 앱에 로그인한다(프로필 둘)
- [ ] 시드 상품 사진은 주소가 풀리지 않아 빈칸으로 보인다. 데이터 문제라 그대로 둔다
- [ ] 로컬 DB라 운영 데이터와 다르다. 시연에서 만든 주문은 로컬에만 남는다

누르지 말 곳은 4절을 본다.
