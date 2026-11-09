# 00-loop-report — loop-08h-chat-rest
요청: #376 후보 4번 중 BE 없이 되는 것 — 도매 입력창 높이 변화와 바닥 지키기, 헤더 `답 필요` 배지 → `/chats?filter=NEEDS_REPLY`, 포장 상태 답(06a Q1 ③, 주문 상태 op 필요 여부를 기획에서 판정). 08g 3번(영구 전송 거절)은 BE 403/404 code 답 뒤라 제외. 보류 말풍선 새로고침 생존은 BE op 필요라 제외. 08f-F2(1280×400 문의 카드 잘림)는 기본값 ① 그대로 둠(사용자 11-06 18:50 "계속 진행해줘", 답 없음 = 기본값). 상한 1.0일. 사용자 지시 11-06 18:50.
기준: origin/dev 757a09f(08g #384 #385 머지). 작업 트리 clean.
08g "다음 회차 바꿀 것" 적용: ① accept 사유에 호출부 grep 목록(이번 accept 0건이라 해당 없음) ② QA brief에 outputPath 규칙(적용, QA 절대 경로 0) ③ brief-dev에 MSW `context().route` 메모(적용했으나 **틀린 메모였다** — 문제 3) ④ brief에 변이 예상 안 씀(적용) ⑤ 1차 리뷰에 전역 리스너·shared 변경 순서 항목(적용, 둘 다 0) ⑥ stage 줄 전에 `date`(적용, 시각 오기 0) ⑦ 코드래빗 한도 보고(아래 머지 절).

## 요약
- Story 2, AC 19(unit 2, e2e 15, 02-dev 기록 2) → **19/19**. 이슈 #386 #387 + 후속 초안 #388([loop-08i]). 새 op 0, 계약 stage·G2 없음, 디자인 생략(새 모양 0).
- 커밋 16(01 6, 02 10. 앱 코드 fix 2 + feat 1 + docs 1, 나머지 test 12). diff 26파일 +2,624 −49(앱 코드 약 130줄, 문서 2줄, 나머지 e2e). PR #389(01, base dev) #390(02, base 01).
- findings 15(review 10: Codex R1~R5 + dev 자기보고 N1 + 메타 M1~M6 중 review 성격 포함 / qa 1 / meta 6). exit: fixed 12, dup 1(R4 = N1), accept 0. **앱 코드 결함은 0** — 전부 시험·문서가 기획보다 약한 곳. P1 5(R1 R2 R3 N1 M1), P2 6, P3 3.
- 4종 검증: 16커밋 전부 통과(rebase 된 커밋은 rebase 뒤 개별 재실행 안 함, 내용 변경 0). 전체 e2e 1회 476(475 통과, skip 1, 실패 0, 12.7분, `--workers=2`).
- 재산정: 지점 1 통과(고치기 전 6줄 d = 74 > 48 재현). 지점 2에서 S1 실소요 26분 → 예상 합 0.31일 → 02 진행. 실제: 기획 0.83일 예상 대비 에이전트 작업 약 2h40m(8h 기준 0.33일. 리뷰·QA·수정 포함).
- 토큰(역할별): plan 31만(Opus), dev 44만(Opus, 01 20 + 02 24), review-fix 43만(Opus, 16 + 12 + 15), QA 21만(Opus), Haiku 5만(표 한 줄), Codex 6회(기획 비판 1, 리뷰 1차 2, 2차 1, 메타 3). 합 약 144만. 08g(130만)와 비슷.
- 시간: 18:56 시작 → 23:05 머지(4h09m 벽시계). G1 대기 1h10m. 수정 라운드 3(1차 Codex P1 + N1, 2차 G3 P3 + QA spec, 3차 메타). 승급 0.

## stage 시작 시각
- plan r1: 11-06 18:56 → 19:12 Story 3, AC 20, 0.83일, 새 op 0, 골든 v6→v7(S3 계약 이슈), 열린 질문 5. 26만 토큰, 16분
- codex 비판 r1: 19:13 → 19:17 P1 1(11 포장 원본 소유 매핑 — 다른 도매처 포장을 자기 것으로 답할 위험), P2 18, P3 2. Q3 ② 추천
- plan r2: 19:17 → 19:22 Story 2(S3 포장 답은 `[loop-08i]` 초안으로), AC 19, 0.83일(실행 케이스 수로 다시 셈). §9 받아들임 20 일부 1 반박 0. 재산정 지점 2. 5만 토큰. G1 대기 19:23
- G1 닫힘: 20:33(사용자 "계속 진행해줘" = 기본값 Q1 ① Q2 ① Q3 ②, 대기 1h10m). D55. 이슈 #386 #387 #388, #376 코멘트
- dev 01 #386: 20:34 → 21:00(26분, 20만 토큰, 88 도구). fdc10e9 ddfa2ba, AC 9/9, e2e 13 + R2 2, unit 3, 변이 5. 재산정 지점 1 통과. 지점 2: 0.054 + 0.31 × (0.054 ÷ 0.32) + 0.20 = 0.31일 → 02 진행. 규칙 위반 자기보고 2(curl -o /dev/null, 소매 서버 직접 띄움). QA 후보 M5 공백(02-dev §6 2)
- codex 리뷰 01: 21:05 → P1 2(R1 S1-5 ② 사장 스크롤 예외 못 잡음, R2 400ms 시각). 02 개발과 병렬
- dev 02 #387: 20:58 → 21:28(28분, 24만 토큰, 108 도구). 5009d04 1887e70, AC 10/10, e2e 13(test.fail 1), unit 3, 변이 3(M3 못 잡음). AC 조건 변경 2(S2-5 fetch gate, S2-9 ③ 101 → 104 test.fail). **N1** 옛 spec 8케이스 회귀 자기보고. 규칙 위반 1(2>/dev/null)
- review-fix 1차(R1 R2 N1) + codex 리뷰 02: 21:33 병렬. codex 02 → P1 1(R3 S2-9 ③ test.fail 범위), P2 1(R4 = N1 dup). R3 추가 전달 21:41. 수정 끝 21:48(25분, 16만 토큰): 01 16e1334 a138464, 02 rebase + a55be89(N1 pushChats 7파일 8케이스, S2-1 D55로 다시 씀) de6fe29(R3). 앱 코드 0. commitlint subject-case 1회
- qa + codex 2차: 21:52 병렬. codex 2차 21:55: R1 R2 R3 N1 닫힘, 새 P3 1(R5). QA 22:12(25분, 21만 토큰): **머지 가능**, AC 17 직접 + 2 기록, 전체 e2e 476(475/1 skip/0 실패), 결함 Q1 P3(시연 대본), 자기보고 불일치 0, QA spec 3(22케이스). **QA 변이 0 — qa hook이 앱 코드 Edit를 막음**
- G3 거부권 22:13: R5 Q1 fixed, QA spec 회귀 커밋(D53 Q3 ② 선례), QA 변이 5개 대행 → review-fix 2차 22:14 → 22:30(17분, 12만 토큰): 01 a9bcda4, 02 rebase + 819d2d5(R5) 97cb13f(Q1) 8eaaf49(QA spec, 제목 가운뎃점 amend — 내 brief 실수). 변이 5개 전부 잡힘(QA spec 직접 2). 규칙 위반 1(curl -o /dev/null, sleep)
- 메타 1차: 22:33 → 22:40 **HOLD** P1 1(M1) P2 5(M2~M6), 전부 시험. G3 거부권 22:45 전부 fixed → review-fix 3차 22:46 → 22:48(12분, 15만 토큰): 01 0475014(M1), 02 rebase + 74c2dd4(M3) c8be8ae(M2 M4 M5 M6). 앱 코드 0. 규칙 위반 1(curl >/dev/null)
- 메타 2차 22:50: M2 기획 표 예외 한 줄 남음 → Haiku 표 보강(5만) → 3차 22:53 **MERGE**
- stage 7: 22:55 push 2, PR #389 #390(`@coderabbitai review`). 코드래빗 5분 대기

## 머지
(코드래빗 결과와 머지 해시는 아래 "코드래빗" 줄에)
- 코드래빗: #389 리뷰됨, inline 0건, Merge Risk Minimal. #390은 base가 01 브랜치라 "Review skipped" → 389 머지 뒤 base dev로 바꾸고 `@coderabbitai review` 코멘트 → "Review rate limited"(무료 한도) → 11-04 규칙으로 머지. #390 머지가 처음 BLOCKED: 필수 check `ci`가 base 전환으로는 안 돌아서(workflow는 `pull_request: [main, dev]`) PR close/reopen으로 CI를 띄움
- 머지: #389 squash → dev 16a72a5(22:56), #390 base dev로 전환 뒤 CI(close/reopen으로 띄움) 통과 → squash → dev **009ce48**(23:05). 이슈 #386 #387 자동 닫힘. 열린 PR 0, 작업 트리 clean. 로컬 브랜치 2개는 남김(삭제는 사용자)

## findings (15)
| id | type | sev | src | 내용 | exit |
|---|---|---|---|---|---|
| R1 | review | P1 | codex | S1-5 ② 사장 스크롤 예외 못 가름(M5 변이 통과) | fixed a138464(S1-5 ③) |
| R2 | review | P1 | codex | 400ms 전제조건을 Node 시계로 | fixed 16e1334(페이지 `performance.now()`) |
| N1 | review | P1 | dev | 헤더 링크로 `/chats` 들어가던 옛 spec 8케이스 회귀 | fixed a55be89(`pushChats`, S2-1 D55 재작성) |
| R3 | review | P1 | codex | S2-9 ③ test.fail 범위가 앞 단계 회귀 숨김 | fixed de6fe29 |
| R4 | review | P2 | codex | = N1 | dup |
| R5 | review | P3 | codex 2차 | S2-1 배지 없음 갈래 빠짐 | fixed 819d2d5 |
| Q1 | qa | P3 | qa | 시연 대본 장면 1에 칩 `전체` 단계 없음(D55 결과) | fixed 97cb13f(docs) |
| M1 | meta | P1 | codex | 08c R2 위 출발이 기준 말풍선 top 안 봄, 첫 읽음 응답 대기 없음 | fixed 0475014 |
| M2 | meta | P2 | codex | 같은 주소 배지 = 기록 +0·재마운트 0인데 기획 표엔 예외 없음, QA 기록만 | fixed c8be8ae + 기획 표 한 줄 |
| M3 | meta | P2 | codex | 리허설 2개가 헤더 클릭을 우회(대본과 어긋남) | fixed 74c2dd4 |
| M4 | meta | P2 | codex | header-scene QA spec 기록형 | fixed c8be8ae |
| M5 | meta | P2 | codex | "300ms 안 클릭" 시간 조건 없음 | fixed c8be8ae |
| M6 | meta | P2 | codex | S2-9 count 도착 전 클릭 가능(같은 빈틈 4곳) | fixed c8be8ae |
자기보고 불일치: 0(QA가 개발 Δ 표, GET 0, R3 실패 위치를 실측으로 확인). 산출물 줄 수: 01-plan 221, 02-dev 94 + 97 + 70 + 67 + 67, 03-review 약 40, 04-qa 약 110, codex-meta 약 30.

## 문제(프로세스가 막힌 곳)
1. **QA가 변이를 하나도 못 넣었다.** `guard-run-scope.sh`의 qa stage가 앱 코드 Edit를 막는다(의도: QA는 코드를 안 고침). 변이는 "넣었다 되돌림"이라 같은 규칙에 걸린다. 이번엔 수정 2차 에이전트가 QA 계획 5개를 대행(전부 잡힘, 단 QA spec이 직접 잡은 건 2개뿐 — 나머지는 개발 spec·unit이 잡음). 08g까지는 QA가 변이를 돌렸다고 보고했는데 그때 hook이 없었는지는 확인 안 함.
2. **메타 리뷰가 3라운드.** 1차 HOLD 6건이 전부 "QA 즉석 spec을 회귀 커밋했는데 단언이 기록형" + "N1으로 옛 spec을 고치면서 리허설까지 우회". QA spec을 커밋하기 전에 단언형인지 거르는 기준이 brief에 없었다.
3. **brief-dev-2의 `context().route` 메모가 틀렸다.** 08g 배운 것 ④를 그대로 옮겼는데, 그건 MSW worker가 passthrough로 다시 보내는 RSC 요청 얘기였다. 목이 답하는 API 요청은 페이지 안에서 끝나 `context().route`에 안 걸린다(S2-5 30초 시간 초과 뒤 fetch gate로). 이슈 02가 25분 중 몇 분을 여기에 썼다.
4. **N1을 기획이 못 봤다.** 헤더 링크 href 변경이 다른 회차 e2e 8케이스를 깨는 건 `grep chatLink` 한 번이면 보였다. 기획 §4-2 "지금 확인한 것"에 "이 링크를 누르는 기존 spec" 항목이 없었다.
5. 내 brief 문구의 가운뎃점이 커밋 제목으로 들어가 amend 1회(8eaaf49).
6. 규칙 위반 자기보고 6건(curl -o /dev/null 3, 2>/dev/null 1, sleep 1, 소매 서버 직접 띄움 2 — 이건 Playwright webServer 설정이 소매 3101을 요구해서 생기는 것이라 규칙이 아니라 설정 문제). 파일 쓰기 위반 0.
7. Playwright 기본 설정의 소매 project가 0건(`testIgnore`로 전부 stub 설정에 있음) — 전체 e2e 476건이 모두 도매. 이번 diff와 무관하지만 "전체 e2e 1회"가 소매를 안 본다.

## 다음 회차에 바꿀 것
1. QA brief에 "변이는 오케스트레이터가 센티널을 `stage=dev`로 잠깐 바꿔 QA가 돌리게 하거나, QA가 변이 목록만 남기고 수정 에이전트가 대행" 중 하나를 명시(이번은 후자). 또는 qa hook에 "되돌림 전제 변이" 예외 경로를 만들지 결정.
2. QA 즉석 spec 회귀 커밋 조건에 "모든 케이스가 단언을 가짐(기록형 0), 시간 경합 시험은 페이지 시계로 전제조건 단언"을 넣는다(M4 M5 M6 예방).
3. 기획 §4 "지금 확인한 것"에 "바꾸는 요소를 누르는 기존 e2e(`grep`)" 항목 필수. 리허설·대본 spec은 실제 사용자 길을 유지한다(우회 금지).
4. 08g 배운 것 ④를 고쳐 쓴다: "`context().route`는 RSC 같은 passthrough 요청만. 목이 답하는 API는 08b gate(fetch 감싸기)".
5. brief에 가운뎃점 금지(커밋 제목에 그대로 들어간다).
6. Playwright 기본 설정의 소매 project 0건을 고칠지 결정(전체 e2e가 소매를 안 봄). 별도 이슈 후보.
7. 서버 대기는 `until curl -sI … ; do …; done` 꼴을 brief에 예시로 — `/dev/null` 위반 3건이 전부 서버 대기였다.

## 소마 보고서용 3줄(10-28 R26)
1. 평가위원 질문 중 "사장이 실제로 쓰기 편한가"에 답한다 — 긴 답을 쓰는 동안 소매 글이 입력창 뒤로 숨지 않고, 헤더 배지 한 번으로 답할 방만 모인 목록이 열린다.
2. "문제점 및 해결" 소재: 헤더 링크 하나를 바꾸자 옛 e2e 8케이스와 시연 리허설이 깨졌다. 목록 자체를 보는 시험은 직접 이동으로, 대본을 걷는 리허설은 실제 클릭 + 칩으로 갈라 고쳤고 대본에도 그 단계를 적었다.
3. 중간점검 의견 "AI가 만든 코드의 검증" — 이번 회차 결함 15건 중 앱 코드 결함 0, 전부 시험이 기획보다 약한 곳을 Codex 리뷰·메타 리뷰가 잡았다(QA 변이 5개 전부 잡힘).
