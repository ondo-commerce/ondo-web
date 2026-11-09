# loop-08k-order-packing-backorder — 회차 보고

요청: 채팅 08k — 주문 탭 포장이 미송 목 미송을 줄이기(#398, 08j Q2 ①이 남긴 역방향). 시작 2026-11-07 21:35, 기준 origin/dev b072f81. 사용자 지시 "작업이 덜 된 부분 전부 계속 진행해줘"(21:33).
08j "다음 회차 바꿀 것" 적용: ① e2e 두 번 실패 규칙을 "같은 원인으로 두 번"으로(brief-plan 배운 것 8) ② QA 변이 요청서 "후보" 표기(3) ③ 4종 출력은 화면으로만(9) ④ 추정 × 0.3~0.4(상한) ⑤ 스택 squash 처리는 §8에(10). ④ lint에 e2e 포함 chore는 별도 이슈 후보.
병행: loop-09-form-back-guard(#255) 기획을 같은 세션에서 병렬로 돌린다(둘 다 plan stage라 runs/만 씀).

## 요약
- 결과: 주문 탭에서 포장이 생기는 세 길(포장 준비 op, 확정 op 이번 출고, reset readyPackings)이 대응 미송을 min(포장량, 잔량)만큼 줄이고 예약을 올리고 08j 기록에 남겨 삭제가 되살린다. 미송 탭 배분과 섞여도 이중 차감 0, 실패와 출고 뒤 삭제는 불변. 주문 탭과 미송 탭 가용재고가 같은 값. 새 op 0, 골든 0, 앱 코드 0.
- 이슈 2(#398 목, #402 e2e). PR 2(#405 #406 스택). 커밋 5(feat 1, test 4). dev cdb20a1. 열린 이슈 13(#398 #402 닫힘).
- 시간: 기획 r1 11분 + Codex 3분 + r2 4분, G1 대기 0(포괄 지시), 이슈 1분, 01 14분, 02 4분, **세션 중단 22:13 → 22:41(28분)**, Codex 리뷰 4분 + 보강 6분, QA 26분(병렬), 메타 4분(수정과 병렬), 수정 7분, PR과 머지 9분. 작업 합 약 1h25m(중단 빼고). 추정 0.285일(상한 0.4), × 0.3~0.4 예상 0.086~0.114일, 실측 약 0.18일(QA 전체 e2e 24분 포함).
- 토큰: 기획 40만, 01 21만, QA 17만, 수정 11만, Confluence 기획 17만, 02 미기록, Codex 4회. 합 약 106만+.
- AC 18/18(통과 16, 기록 충족 2). 시험: unit api 552 → 573(+21, expected fail 1), e2e 개발 2 + QA 4, 변이 개발 10 + QA 대행 5 = 15 전부 잡힘(QM2는 unit 추가 뒤).
- 자기보고 불일치 0. 규칙 위반 자기보고: QA sleep 없는 until busy loop 1(pkill 뒤 caffeinate -w), 01 0, 02 0, 수정 0(commitlint subject-case 거절 1회 → 제목 고침).
- findings 2(qa 1, 시험 공백 1 = QA 변이 QM2 생존, 전부 P3 test): fixed 2(51a9350). 앱 코드 결함 0. dev↔리뷰 라운드 0, 수정 라운드 1. 메타 1차 MERGE. 코드래빗 #405 Low 지적 0, #406 한도.
- 4종 통과율 커밋 5/5. 승급 0.
- **소마 보고서용 3줄**: ① "자동 응답이 실제 운영 데이터와 맞물리는가"에 답한다 — 주문 탭 포장, 미송 탭, 채팅 답이 한 숫자를 본다(08j의 역방향까지 닫음) ② 문제점과 해결: 포장 길이 넷이라 공통 함수에 알림을 넣으면 미송 탭 배분이 이중 차감 → 세 호출부에만 알림 칸 + 실패 뒤 snapshot 불변 시험 + 변이 15개 ③ 중간점검 의견 "Operations Agent 구현 성과" — 목 두 저장소(주문, 미송)가 양방향으로 같이 움직인다.

## 문제와 다음 회차에 바꿀 것
1. 세션 중단 뒤 재개가 28분, 질문 0으로 이어졌다(보고서 "재개 절차 6단계" 덕). 회차마다 중단 시점에 재개 절차를 적는 것을 기본으로.
2. QA가 "sleep 금지" 규칙 때문에 `until … ; do :; done` busy loop로 e2e를 기다려 CPU를 먹었다. 브리프에 "긴 명령은 foreground `caffeinate -i`로 직접 기다리거나 배경 pid를 `caffeinate -w <pid>`로"를 명시. 서버 대기 `until curl` 꼴은 짧아서 그대로.
3. QA가 "생존 예상"이라 적은 변이(QM2)가 실제로 살아남아 시험 공백(08k-F1)을 잡았다. 변이 요청서에 "생존 예상" 항목을 넣는 것을 유지하고, 수정 브리프에 "생존하면 findings 추가 + unit 추가"를 기본 절차로 적는다(이번엔 오케스트레이터 프롬프트로 지시).
4. 스택 동기화 머지 커밋 제목을 `merge: …`로 썼다가 commitlint(type-enum)에 걸렸다. 기본 문구 `Merge remote-tracking branch 'origin/dev' into <branch>`(commitlint가 무시)를 절차에 적는다.
5. 추정 0.285 대비 실측 0.18(0.63배). QA 전체 e2e 24분이 고정비라 작은 회차일수록 비율이 높다. 곱 0.3~0.4는 유지하되 QA 고정 0.05일을 더해 예상한다.
6. `codex_review` 출력 83KB가 도구 한도를 넘어 파일로 떨어졌다(결론은 첫 줄). 문제 아님, 기록만.
7. 코드래빗은 #405(base dev)만 봤고 #406은 base 변경 뒤 rate limited. 한도는 머지를 막지 않는다(11-04).

## stage 시작 시각
- plan r1: 11-07 21:35 → 21:46 Story 2(S1 목 unit, S2 e2e), AC 15(unit 11, e2e 2, 기록 2), 목 HTTP unit 16, 0.26일(상한 0.4, × 0.3~0.4 = 0.08~0.10일), 새 op 0, 디자인 생략. 정할 것 1 추천 (a) 주문 탭 포장 세 길(포장 준비, 확정의 이번 출고, reset readyPackings)이 미송을 줄이고 08j 배분 기록에 남겨 삭제 부활이 따라옴. 기대 바뀌는 기존 시험은 backorderPacking.test.ts 행 4 + 이름 1(S1-7 ①② code 변경, S1-11 ⑤는 가드 직접 호출 unit으로). 열린 질문 3(Q1 (a), Q1-2 ① 예약도 올림, Q2 ① 가드 유지). 25만 토큰, 11분
- Codex 비판 r1: 21:47 → 21:50 9항목(P1 0, P2 3 min 경계 AC 없음 / 같은 SKU 두 주문 가용재고 불일치 한계 / 역방향 대응 오매칭 시험 없음, P3 6). Q1 (a) Q1-2 ① Q2 ① 반대 근거 없음(Q1-2 효과 범위 좁히기)
- plan r2: 21:51 → 21:55 받아들임 9, 일부 0, 반박 0. AC 18(unit 14 그중 it.fails 1, e2e 2, 기록 2), 목 HTTP 새 17 + 직접 함수 unit 1 + 기존 시험 고침 2, 0.285일(상한 0.4, × 0.3~0.4 = 0.086~0.114일), 떼는 것 0, 재산정 기준 01 0.145. 새 AC S1-13 min 경계, S1-14 역방향 오매칭, S1-15 같은 SKU 한계(it.fails). 열린 질문 4(Q1 (a) Q1-2 ① Q2 ① Q3 ① 안 고침). 15만 토큰, 6분(r1 합 40만)
- G1: 21:56 사용자 포괄 지시(21:33 "작업이 덜 된 부분 전부 계속 진행") = 기본값 채택(Q1 (a) Q1-2 ① Q2 ① Q3 ①), 패킷은 채팅에 올리고 진행(거부권). 대기 0. D61. G2는 새 op 0이라 기존 op 동작 변경 셋 확인으로 갈음
- 이슈 생성: 21:57 #398(01 다시 씀) #402(02 e2e)
- dev(#398, S1): 21:58 → 22:08 커밋 2(3d6b9a2 세 길 차감 + 기록 + 08j 시험 고침 + 가드 직접 unit, 09831b0 새 unit 도매 16 소매 1). AC 15/15, 변이 7/7 잡힘, 4종 2/2(api 572 + expected fail 1), 회귀 재실행 48 통과, chat과 openapi와 08i 시험 diff 0. 약 14분(0.010일, 기획 0.145의 0.07), 21만 토큰. 위반 0. 커밋 2(브리프 3 → 구현과 기존 시험 고침을 한 커밋에, 따로 하면 4종 못 넘김). 발견: S1-15 ② it.fails는 준비 단언이 다른 이유로 깨져도 통과(①이 같은 준비를 일반 시험으로 막음)
- 재산정(01 끝): r = 0.07 → 02 0.14 × 0.07 ≈ 0.01, QA 0.10, 합 0.01 + 0.01 + 0.10 = 0.12일 < 0.4. 02 진행
- dev(#402, S2): 22:09 → 22:13 커밋 1(d1debc6 helpers + spec 2케이스 + 설정, +209 −1). AC 3/3(S2-1 S2-2 통과, S2-3 변이 3/3 잡힘 M1 포장 준비 알림 지움, M2 삭제 부활, M3 예약 올림 지움). 4종 통과. 약 4분. 보기 글자 실제값은 02-dev-402.md. 에이전트는 보고서를 다 쓴 직후 사용자 중단 지시로 멈춤(작업 트리 clean 확인)
- **중단(사용자 지시 22:13 "지금 중단할거야")**: 브랜치 `feat-398-order-packing-backorder`(3d6b9a2, 09831b0)와 `feat-402-order-packing-backorder-e2e`(d1debc6) 미푸시. 센티널 삭제, 체크아웃 dev(b072f81), 작업 트리 clean.

- **재개(11-07 22:41, 사용자 "작업 계속 진행해줘")**: 체크아웃 feat-402(d1debc6), 센티널 stage=qa app=api. QA(ondo-qa)와 Codex 리뷰 병렬 시작
- Codex 리뷰 r1: 22:41 → 22:45 `codex exec review` 지적 0. 보강 codex_ask r1b 22:46 → 22:52 P0~P3 0(여덟 곳 코드 줄 확인, 참고 1: S1-14가 소매처 불일치는 독립 검증 안 함). `03-review.md`
- Confluence 기획(QA와 병렬, Haiku): 22:53 → 22:55 기획 22(08k, 3211496)와 23(09, 3178580) 생성. 17만 토큰, 72초
- QA(Codex와 병렬): 22:42 → 23:08 판정 통과. AC 18/18(통과 16, 기록 충족 2), 자기보고 불일치 0. 전체 e2e 도매 522/523(skip 1 원래), 소매 stub 466/466, 이번 diff 탓 실패 0. findings 1(08k-Q1 P3 test, S1-6 ① it.each 이름이 기대 code 대신 7002 8002로 찍힘). 변이 요청 5(QM1~QM5, QM2는 "생존 예상" = 한 줄에 대응 미송 여럿인 시험 없음). QA spec 1(4케이스) untracked. 약 26분, 17만 토큰. 위반 자기보고 1(sleep 없는 until busy loop → pkill, 뒤에 caffeinate -w)
- G3(거부권, 23:10): 08k-Q1 P3 → fixed(시험 이름 틀 고침). QM2 생존이면 시험 공백으로 findings 추가해 같은 라운드에서 unit 1개 추가(판단 2 "한 줄에 대응 미송 여럿"). 센티널 stage=dev. 수정 라운드와 메타 리뷰 병렬
- 메타 리뷰(수정과 병렬): 23:11 → 23:15 codex_ask. 기획과 코드 다른 곳 0(권고 1: 한 줄에 대응 미송 여럿이면 배열 순 분배, 기획 미정의 → D63에 명시), 개발 판단 반대 0, 근거 약한 AC 0. 새 findings 0. 1차 MERGE
- 수정 라운드(Q1 fix + F1 unit + 변이 대행 5 + QA spec 커밋): 23:10 → 23:17 51a9350(feat-398, S1-6 ① 행 순서로 이름 고침 + 08k-F1 합성 unit 9902), feat-402 rebase(9a84b2a), 89d996b(QA spec 4케이스). 변이 QM1 QM3 QM4 QM5 잡힘, QM2는 기존 58에서 생존 → F1 unit 추가 뒤 잡힘. 4종 두 tip 통과(api 573 + expected fail 1). 약 7분, 11만 토큰. 위반 자기보고 0(commitlint subject-case 거절 1회 → 제목 고침). findings 2/2 닫힘(fixed 2)
- D63 기록(23:18): G3 거부권, 다중 대응 분배는 배열 순으로 명시(메타 권고)
- push + PR: 23:18 PR #405(#398, base dev, +745 −29 중 시험 620), #406(#402, base 398, +437 −1 e2e). #406 본문에 @coderabbitai review
- 코드래빗 + CI: 23:18 → 23:22 #405 CI 2m30s 통과, 코드래빗 Merge Risk Low inline 0. #406 skip(base). Codex 머지 판정 MERGE(23:23)
- 머지: 23:23 → 23:26 #405 squash 00bb45a → feat-402에 origin/dev 합침(`merge:` 제목이 commitlint에 걸려 기본 Merge 문구로, 53b1b9a, 89d996b 대비 트리 diff 0) → push → base dev, CI 2m37s(코드래빗 rate limited) → #406 squash cdb20a1. dev 트리 = 스택 tip diff 0. 이슈 #398 #402 닫힘, 열린 PR 0, 열린 이슈 13. 센티널 삭제
- 닫음: 23:27 진행판과 현황과 인수인계 갱신(update-08k-docs.py), Confluence 회차 보고(3178598)와 결정 로그 589825 v15(D61~D63. D59 D60이 빠져 있던 것 발견 → 같이 끼워 넣음), 메모리. 회차 시작 21:35 → 끝 약 23:35(중단 28분, 작업 약 1h25m)
## 재개 절차(다음 세션, 이미 끝남 — 기록용)
1. `git checkout feat-402-order-packing-backorder-e2e` → 센티널 `slug=loop-08k-order-packing-backorder app=api stage=qa` → `brief-qa.md`로 ondo-qa 호출 + `codex_review --base origin/dev`(병렬) + codex_ask 보강 질문(08j 꼴) → `03-review.md`.
2. 수정 라운드 `brief-fix.md`(findings fixed + QA 변이 대행 + QA spec 커밋, 수정 커밋은 feat-398에 뒤 feat-402 rebase).
3. G3 패킷(거부권), 메타 리뷰 codex_ask → `codex-meta.md`, 결정 로그 D63.
4. push 두 브랜치 → PR #398(base dev, 800줄 초과 사유: 시험이 대부분) #402(base 398, 본문 끝 @coderabbitai review) → 코드래빗 → #398 squash → feat-402에 origin/dev `-X ours` 합치고 트리 diff 0 확인 뒤 push → base dev로 바꾸고 CI → squash.
5. 닫기: 이 보고 요약 채우기, 진행판과 현황과 인수인계 재발행(scratchpad/update-08j-docs.py 꼴로 08k 행 추가), Confluence 기획 22와 회차 보고(Haiku, `runs/loop-08i-chat-packing/qa/confluence-sync-brief.md` 규칙), 메모리.
6. 그다음 loop-09(`runs/loop-09-form-back-guard/brief-dev.md`, 이슈 #255, 센티널 app=wholesale stage=dev) → #403 → #401 chore.
