# wire-01-live-server — 회차 보고 (실서버 연동 확인)

요청: 채팅·알림·자동 답 설정·문의 지표·정산 계좌를 목(MSW) 대신 로컬 실서버(ondo-api dev 753a99d, 도매 :8081, 소매 :8080)에 붙여 화면 끝까지 확인하고 어긋남을 고친다(#420). 전제: wire-00 contract-check "초안 그대로 연동 가능". 시작 2026-11-09 22:03, 기준 origin/dev 154f437. 사용자 "계속 진행해줘".
구조: 채팅·알림 화면은 이미 `apiFetch`로 호출하고 MSW가 답하던 구조라 코드 연동(fixtures 제거)은 없다. 이번 회차 = Verify(dev 모드, 두 앱 동시) → 결함 → 수정(ondo-dev) → PR.
모델: Verify ondo-verify(Opus), 수정 ondo-dev, 리뷰 Codex, 오케스트레이터 이 세션.

## 요약
- 결과: 채팅·알림·자동 답 설정·문의 지표·정산 계좌가 **로컬 실서버로 끝까지 돈다.** 시연 장면 1~3 통과, 10항목 중 9 통과. 결함 1(소매 정산 입금 계좌가 "계좌 미등록" — 스냅샷에 op가 없어 손으로 쓴 wire 타입이 서버 모양과 달랐음) → 초안 op 2개 추가 + 생성 타입으로 교체 + 실서버 e2e 설정(`pnpm e2e:live`, 3200/3201) + live spec 3.
- 이슈 #420 + 후속 #422(live spec 보강). PR #421(squash, 커밋 3). 열린 이슈 10.
- 시간: Verify 12분, 수정 A 4분 + B 9분, Codex 5분, PR·CI·머지 8분. 실작업 약 45분. 토큰 Verify 17만, 수정 29만, Codex 1회.
- findings 5: fixed 2(W1-1 P1 web, W1-2 P3 spec), issue 2(W1-3 W1-4 P2 test → #422), dup 1(W1-5 코드래빗 = W1-3). 앱 코드 결함 1(소매 계좌). Codex P1 0 P2 2. 코드래빗 inline 1(답글).
- 4종 통과율 3/3. 쓴 데이터(로컬 DB): 방 1 메시지, 주문 6007/7007 외 live e2e 3회분.
- **소마 보고서용 3줄**: ① "실서버에서 실시간 시연"에 답한다 — 재고·미송·미수 문의가 소매 → 도매 → 소매로 실제 서버를 거쳐 돈다 ② 문제와 해결: 소매 정산 화면만 서버와 어긋남 → 원인은 스냅샷 부재로 손으로 쓴 타입. 생성 타입으로 바꾸고 실서버 e2e를 남겨 재발 방지 ③ 우선순위 1(화면이 서버와 어긋나지 않음) 위반 1건을 실서버 검증이 머지 전에 잡음.

## 문제와 다음 회차에 바꿀 것
1. live e2e가 실서버에 데이터를 남기고 옛 메시지가 `.last()` 단언을 거짓 통과시킬 수 있다(#422). 실서버 spec은 "이번 요청의 응답 id로 특정" 규칙을 브리프 기본으로.
2. 웹 dev 서버를 Verify가 못 끈다(두 회차째) → 오케스트레이터가 끈다를 브리프 기본 문구로(이번엔 그렇게 함).
3. 스냅샷에 없는 op를 화면이 손 타입으로 쓰고 있던 것을 가드가 못 잡았다(`guard-wire-rules.sh`는 새 쓰기만 본다) → 기존 코드 전수 grep 1회를 다음 회차 준비에.
4. 서버 쪽 알림·채팅이 실서버에서 되는데 운영 배포가 없다(api-dev DNS 미해결) → 시연 리허설은 BE 배포 뒤에만 가능. BE 요청 1순위.

## stage 시작 시각
- 준비: 22:03 폴더, 센티널 app=wholesale stage=qa, brief-verify.md
- Verify(dev 모드, 두 앱): 22:03 → 22:15 **판정 연동 확인 완료, 변경 0(W1-1 수정 뒤 머지)**. 항목 10 중 통과 9, 실패 1(소매 정산 계좌). 장면 1~3 실서버 통과(문의하기 → 자동 답 카드 → 장바구니 3장 → 주문 6007 → 도매 종 배지 → 주문 탭 / 되묻기 칩(#6001) → 입고일 답 → 미송 현황 링크 → 도매 입고일 변경 → 소매 알림 / 미수 0원 답 + 정산 링크 + 사람 넘김). polling 체감 배지 28초, 방 안 0.3초. 네트워크 프록시 `/api/...` 확인, MSW 0. 결함 2: W1-1 P1 web(소매 /settlements 입금 계좌 "계좌 미등록" — 서버 `bank.{bankName, accountNo, holder}` vs 웹 `bank.bankAccountNo` — 스냅샷에 op가 없어 손 wire 타입을 쓴 것이 뿌리), W1-2 P3 spec(소매 settlements op 2개 스냅샷 부재). 환경: 시드 CDN `cdn.ondo.test` DNS 실패(결함 아님). 스크린샷 47, 즉석 spec `e2e/wire-01-live-server/live-scene1-3.spec.ts`(live 설정 필요). 약 12분, 17만 토큰. 위반: setTimeout 대기, 웹 dev 서버 못 끔(오케스트레이터 TaskStop)
- G3(거부권, 22:17): W1-1 fixed(소매 derive·types 생성 타입으로), W1-2 fixed(초안 op 2개 추가 → 스냅샷). live e2e 설정 `playwright.live.config.ts` + `e2e:live` 추가. 사용자 턴 0
- 수정 라운드: 22:18 ondo-dev, brief-fix.md A절(계약, 센티널 app=api stage=contract) → B절(소매, app=retail stage=dev)
- 수정 A(계약, app=api): 22:17 → 22:21 ee51487 소매 settlements 초안 op 2(partners, ledger; bank nullable, lastPaidAt date, kind·method enum — 서버 DTO 근거). 목 없음. 4종 통과. 22:22 센티널 app=retail stage=dev, "이어서"
- 수정 B(소매, app=retail): 22:22 → 22:30 f23cc2d(계좌 서버 모양, 손 wire 타입 → 생성 타입, unit 7), c03ce9e(playwright.live.config.ts, e2e:live, live spec 3 — 3회째 통과, 1회 서버 재기동 겹침, 2회 옛 칩 .last()). 4종 커밋마다. W1-1 fixed:f23cc2d, W1-2 fixed:ee51487
- Codex 리뷰: 22:33 → 22:38 P1 0 P2 2(R1 live spec .last() 거짓 통과, R2 live 설정 env 우회) → wire 규칙대로 issue #422(W1-3 W1-4). 앱 코드 결함 0
- push·PR: 22:33 PR #421(base dev). CI 대기
- 코드래빗 inline 1(.last() 거짓 통과 = Codex R1) → 스레드 답글, W1-5 dup. 22:38 squash 머지 dev 9665cbd. 이슈 #420 닫힘, #422 열림(열린 이슈 10). 센티널 삭제. 회차 기록 2폴더는 PR로 커밋
