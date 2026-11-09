# wire-00-sync-spec — 회차 보고 (계약 동기화)

요청: ondo-api dev(753a99d, 11-08~09)가 구현한 채팅·알림·자동 답 설정·지표·정산 계좌 op를 로컬 서버 스펙으로 스냅샷에 반영(#419). 사용자 "오케이 그럼 진행해보자"(20:45). 시작 2026-11-09 20:57, 기준 origin/dev 154f437.
배경: api-dev.ddmondo.co.kr·api.ddmondo.co.kr DNS 미해결(curl 000), ddmondo.co.kr 500 → 서버를 로컬에서 띄움(brew postgresql@16 5432, JDK 21, ~/dev/ondo-api, 도매 :8081 프로파일 local,dev, 소매 :8080 datasource 5432 override). 두 서버 UP 20:55. 스펙 비교: 도매 초안 12 중 11 구현(listing-images 없음), 소매 9/9. 서버에만 있는 op: 소매 settlements 2, dispatch cancel 1, dev/fault 2, 도매 retail-gateway 10.
모델: 계약 ondo-dev(Opus), 오케스트레이터 이 세션.

## 요약
- 결과: **스냅샷 동기화는 보류, 초안 타입 그대로 연동.** 서버 springdoc 스펙은 nullable·required·enum이 없고 소매 Status 이름이 충돌해 받으면 타입 650곳이 깨진다(02-contract.md). 대신 서버 실제 응답을 웹 초안 스키마로 검증(03-contract-check.md): 24 op 통과, 자동 답 낱말 일치, 어긋남은 도매 공통 errors[] 모양(웹이 이미 흡수)과 bank POST createdAt 형식뿐. 이슈 #419는 springdoc 주석 5종이 붙은 뒤 재개(댓글).
- 커밋 0, PR 0(동기화 시도는 stash에 보관). 로컬 서버 기동 절차를 만들었다(brew postgresql + JDK 21 + bootRun 두 개, nohup).
- 시간: 서버 확인·기동 12분, sync 시도 4분, 결정 대기 약 40분(사용자 질문 왕복), contract-check 13분(+세션 끊김 재개). 실작업 약 35분.
- findings 0(결함 회차 아님). 결정 2(decisions.md). BE 요청 6개 묶음은 결정 로그 3절.
- **소마 보고서용 3줄**: ① 서버 팀이 만든 API를 웹 계약으로 자동 검증해 "붙여도 되는가"를 13분에 판정 ② 문제와 해결: 자동 생성 스펙 품질이 낮아 타입이 무너짐 → 문서 대신 실제 응답을 스키마 검증하는 길로 바꿈 ③ 우선순위 1(화면이 서버와 어긋나지 않음)을 지키려 ADR-0002(스냅샷이 원본)를 잠시 미룬 결정을 사람이 내림.

## 문제와 다음 회차에 바꿀 것
1. 배경 작업(bootRun)은 세션 종료와 시간 제한에 꺼진다 → 로컬 API 서버는 nohup으로 띄우고 로그는 scratchpad `be-logs/`에. 하네스 문서에 기동 절차 한 절.
2. `git stash -u`가 untracked 회차 폴더(00-loop-report.md)까지 담았다 → 회차 중 stash 금지, 필요하면 `git stash push -- packages/api`처럼 경로 지정.
3. sync-spec에 스냅샷 파일을 소스로 넘기면 "초안 폐기" 문구가 오탐 → 스크립트에 "소스가 스냅샷 자신이면 초안 검사 건너뜀" 보강 후보.
4. auto mode 분류기가 외부 레포 코드 실행(bootRun)과 PR 생성을 간헐 거부 → 같은 명령 재시도가 통과함. 사용자 설정에 허용 규칙 후보.

## stage 시작 시각
- 준비: 20:45 → 20:57 BE 레포 확인(PR #72~#79), 서버 로컬 기동(bootRun 1회 분류기 거부 뒤 재시도 통과), 스펙 비교, 이슈 #419, 센티널 app=api stage=contract, brief-contract.md
- contract: 20:58 ondo-dev 호출
- contract(sync 시도): 20:58 → 21:01 커밋 없이 멈춤(결정 필요). 서버 springdoc 스펙에 nullable·required 없음, 요청 본문 `additionalProperties: {}`, 소매 enum string, 소매 `Status` 이름 충돌(dev/fault 모양) → 받으면 typecheck 깨짐 도매 chat 98 notification 34, 소매 chat 114 notification 30 order 2, 목 377. op 수 도매 70 → 80, 소매 29 → 34, 초안 잔존 listing-images 1. 시도 결과는 stash@{0}(브랜치 chore-419-sync-server-spec)에 보관. 02-contract.md
- 결정(사용자, 21:05~21:45): 서버 API 자체는 정상(시드 계정으로 11 op 응답 확인). 문제는 자동 문서 주석 → **서버 실제 응답을 웹 계약과 대조해 일치하면 초안 그대로 연동, 아니면 서버 코드를 고친다**(decisions.md)
- contract-check: 21:47 general-purpose(Opus) 호출, brief-contract-check.md. 상한 40분
- **중단**: 21:52 세션 종료로 contract-check 에이전트와 로컬 서버 두 대가 꺼짐(결과 results.json·results2.json·run1~3.log는 scratchpad에 남음, 03-contract-check.md는 아직). 21:54 재개(사용자 "계속 진행해줘"), 서버 재기동 21:57 둘 다 UP(gradle 캐시로 빠름), 에이전트 SendMessage로 재개(남은 항목만, 상한 20분)
- contract-check 끝: 21:58 **판정 "초안 그대로 연동 가능"**. 일치 24 op(도매 초안 11 + bank-accounts 4 + 소매 초안 9), 어긋남 0(성공 응답), 미검증 2(소매 settlements — 웹 스냅샷에 op 없음). (가) 서버가 고칠 것 2: 도매 공통 `errors[] {field, reason}`(채팅 400 4곳, 중복 계좌 400), bank POST `createdAt` `+09:00`. (나) 웹이 맞출 것 1: 목 fixtures 시각 표기 78곳(파싱 결과 같음). (다) 초안 틀림 0(소매 서버 생성부 nullable 누락 3곳은 springdoc 요청에 묶음). 자동 답 낱말 일치(재고 되묻기, 구간 답, 미송 입고일, 미수 0원, 넘김 이유 5종). 미송 칩 label 주문 번호가 소매 orderId(#6001, 골든은 도매 #7001) — 기록. 시각 UTC Z 6자리, inquiry-stats 낮 12시 경계 확인. 쓴 데이터: 방 1, 메시지 29, 주문 6006/7006, 알림 각 1, variant 3003 입고일 11-13. 약 13분, 20만 토큰. 03-contract-check.md
- 추가 확인 22:02: 도매 `errors[] {field, reason}`는 `@ondo/api`가 9월부터 `message`로 맞춰 주고 있어(`fieldErrors.ts:106` 주석) 웹 화면엔 이미 영향 0. 결정 2행의 "웹 fallback"은 이미 돼 있는 셈 → BE 요청(code·message 추가)만 남김. 이슈 #420(실서버 연동 확인 회차) 생성
