---
name: ondo-design
description: 온도 ERP(물보라) 디자인 시스템으로 화면을 그릴 때 사용. Figma "창은" 페이지의 공통 컴포넌트·토큰 실측값이 원본이다. 사용자가 화면·페이지·와이어프레임을 만들어 달라거나, 기존 화면을 이 톤에 맞춰 고쳐 달라고 하면 먼저 이 스킬을 적용해 색·여백·컴포넌트를 통일한다.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# 온도 ERP 디자인 시스템

원본은 Figma **물보라** 파일의 **창은** 페이지다 (`vXFxONKv6pwXIdwpPsYSJq`, 페이지 `1393:9972`).
이 문서의 모든 수치는 그 페이지에서 실측한 값이고, 근거·node-id 대조는 [reference/figma-map.md](reference/figma-map.md)에 있다.

## 언제 쓰나

- 새 화면을 그려 달라고 할 때 (가장 흔한 경우)
- 기존 화면을 이 톤으로 고쳐 달라고 할 때
- "이 시스템에 이런 컴포넌트가 있나?" 를 확인할 때

사용자가 참고 이미지나 설명을 함께 주면:
1. 그 설명은 **무엇을 담을지**(들어갈 항목, 배치, 흐름)의 근거로만 쓴다.
2. **어떻게 보일지**(색·여백·컴포넌트 모양)는 참고 이미지와 달라 보여도 항상 이 문서를 따른다.
3. Figma 원본과 대조가 필요하면 figma-map.md의 node-id로 해당 화면을 확인한다.

## 만드는 방법

1. `reference/ondo.css` **전체**를 새 파일의 `<style>` 안에 그대로 붙여넣는다.
   `<link>`로 걸거나 공용 CSS로 빼지 않는다 — 파일 하나가 단독으로 열려야 한다.
2. **셸**(사이드바 + 상단바)을 먼저 깔고, 그 안에 **레이아웃 3종** 중 하나를 골라 뼈대를 복사한다.
3. `reference/catalog.html`에서 필요한 컴포넌트 마크업을 가져다 채운다.
   카탈로그에 없는 모양이 필요하면 **새 색·새 폰트 크기·새 반경을 만들지 말고** 기존 토큰 조합으로 만든다.
4. 결과는 설명이 아니라 실제 `.html` 파일로 낸다. 기본 위치는 `~/onDo/design/pages/<NN>_<이름>.html`
   (사용자가 다른 곳을 지정하면 그쪽으로).

## 셸 — 모든 화면 공통

**좌측 사이드바 + 우측 열(상단바 + 본문)** 이다. 상단 GNB 한 줄이 아니다.
2026-08-23에 앱 코드를 기준으로 확정했다 — 실측 출처는 `apps/wholesale/src/shared/components/AppShell.tsx`이고,
Figma(`1503:5115`)는 아직 GNB로 그려져 있으므로 **Figma 쪽을 고쳐야 한다**(figma-map.md §4).

- **화면 폭은 유동이다.** 1512px 고정을 쓰지 않는다. 본문 좌우·아래 여백 16px.
- 사이드바 `.snb` 208px, 흰 배경 + 우측 1px 선. 접으면 `.snb.mini` 64px(아이콘만).
- 사이드바 항목은 **7개로 고정이고 순서도 고정**이다 — 로고 `온도 ERP` 다음에
  **대시보드 · 주문 · 미송 · 출고 · 상품 · 재고 · 정산**. 빼거나 순서를 바꾸지 않는다.
  현재 항목만 `.active`(회색 채움 + 진한 글자). 항목 높이 40px, 사이 2px.
- 상단바 `.topbar` 52px. **네비게이션을 두지 않는다** — 알림·계정처럼 화면과 무관한 것만 우측에 놓는다.
  **화면 제목도 두지 않는다.** 제목은 각 패널의 `.panel-title`이 갖는다.

```html
<div class="page">
  <div class="snb">
    <span class="brand"><span class="mark">⌘</span><span class="name">온도 ERP</span></span>
    <nav class="menu">
      <a href="#"><span class="ico">▦</span>대시보드</a>
      …7개…
      <a href="#" class="active"><span class="ico">▩</span>상품</a>
    </nav>
  </div>
  <div class="col">
    <div class="topbar"><span class="ico-btn">🔔</span><span class="ico-btn">👤</span></div>
    <div class="main">
      <!-- 아래 레이아웃 3종 중 하나 -->
    </div>
  </div>
</div>
```

## 레이아웃 3종

### A. 목록 + 상세 (기본값)

상품·재고·미송·출고·정산이 전부 이 형태다. **좌측은 유동, 우측은 512px 고정**, gap 16px.
**주문 탭만 예외** — 목록이 전체 폭이고, 행을 펼쳤을 때만 우측 카드가 붙는다(`1702:4429`).

> 872 / 589는 폐기값이다. 화면 폭이 유동이 되면서 좌측을 고정할 수 없어졌고,
> 우측만 고정한다 — 선택할 때마다 목록 폭이 바뀌면 표의 열 너비가 통째로 재계산돼
> 읽던 자리를 놓치기 때문이다. 우측 폭은 선택 전에도 그대로 비워 둔다.

```html
<div class="body">
  <div class="col-main"><div class="panel">
    <h2 class="t-h2 panel-title">상품 관리</h2>
    <!-- 검색 + 우측 주요 버튼 한 줄 -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <span class="f-search">⌕ 품번·품명 검색</span>
      <span class="btn line" style="margin-left:auto">상품 등록</span>
    </div>
    <div class="rows">…</div>          <!-- 아코디언 목록 -->
  </div></div>
  <div class="col-side"><div class="panel">…</div></div>
</div>
```

- 목록은 `.rows > .row` 아코디언이 기본. 펼친 행은 `.row.open`(회색) + 바로 아래 `.row-body`.
- **펼친 행은 화면당 하나만** 그린다 (정보가 가장 많은 것 하나).
- 우측 패널은 선택된 항목의 상세다. 제목 `.t-h1` + `.chip.sub`(코드), 그 아래 `.t-section` 블록들, 맨 아래 액션 버튼.
- 선택 전 우측은 같은 폭의 빈 패널 + 안내 한 줄(`좌측 목록에서 상품을 선택하세요`).

### B. 등록·수정 폼 (좌우 2단)

상품·게시글 등록처럼 묶음이 둘인 폼. **좌우 1:1 2단 + 하단 우측 정렬 액션바**다.

> **세로 1단 + 우측 `.spy` 목차는 폐기했다.** 화면 전체 스크롤을 없애면서
> 목차가 가리킬 대상 자체가 사라졌다. `.spy`는 카탈로그에 폐기 표시로만 남아 있다.
> 좌우 1:1인 이유: 레이아웃 A의 비대칭은 "읽는 목록 + 좁은 상세"라서인데,
> 여기는 양쪽 다 입력하는 폼이라 한쪽을 좁힐 근거가 없다.

```html
<div class="form-2col">
  <div class="panel">…상품 등록…</div>
  <div class="panel">…게시글 등록…</div>
</div>
<div class="actionbar">
  <span class="btn line">취소</span>
  <span class="btn">상품 &amp; 게시글 등록</span>
</div>
```

- 패널 안은 `.field` 반복. 라벨-입력 8px, 필드 사이 22px.
- 필수 항목은 `.field-label` 안에 `<span class="req">*</span>`.
- **필드가 4개를 넘으면 묶음으로 나눈다.** 같은 무게의 라벨이 길게 이어지면 훑을 기준점이 없다.
  - 첫 묶음에는 **제목을 달지 않는다** — 패널 제목이 이미 그 이름이라 같은 말이 두 번 나온다.
  - 두 번째 묶음부터 `.t-section` 제목 + 위에 `.divider`. 간격만으로는 부족하다:
    표처럼 자기 테두리를 가진 덩어리가 섞이면 여백 차이가 묻힌다.
  - 묶음 안에서는 **가벼운 컨트롤(토글·체크)을 먼저, 표를 맨 아래**에 둔다.
    표가 위에 오면 그 아래 붙은 한 줄짜리 컨트롤이 표의 부속처럼 읽힌다.
- **비활성 패널**(시즌 종료 등)은 내용을 **숨기지 않고** 통째로 가라앉힌다.
  잠금을 푸는 컨트롤은 잠기는 영역 **밖**에 둔다 — 안에 두면 잠긴 상자 안에 열쇠가 있는 꼴이다.
- **제출 버튼은 패널 안이 아니라 하단 `.actionbar`에 둔다.** 스크롤이 패널 안에서만 일어나므로
  어느 쪽을 얼마나 내렸든 버튼은 늘 같은 자리에 있어야 한다.
- 액션바 버튼 구성은 화면마다 다르다 — `wholesale_screen_spec.md` §1.2·§1.3의 버튼 정책을 따른다.
- 우측 묶음이 아직 켜지지 않은 상태(게시 체크 전)에도 **폭을 그대로 유지**하고,
  같은 자리에 점선 카드 + 안내를 둔다. 켤 때 좌측이 좁아지면 입력하던 자리가 통째로 밀린다.

### C. 단일 패널

대시보드·설정처럼 상세가 없는 화면. `.col-main` 하나만 두고 `.col-side`를 생략한다.

## 앱 코드와의 관계

이 문서가 그리는 것은 **Figma 임포트용 정적 HTML**이고, 실제 제품은 React(`apps/wholesale`)다.
구조·색·컴포넌트는 같은 것을 가리키지만 두 가지가 의도적으로 다르다.

| | 이 문서(정적 HTML) | 앱 코드 |
|---|---|---|
| 스크롤 | 표현하지 않는다. 내용을 다 펼쳐 그린다 | 화면 높이를 고정하고 `Panel.Body` 안에서만 스크롤 |
| 여백 | 30 / 22px 등 Figma 실측값 | Tailwind 기본 스케일(24px 등). 1~2px 차이는 감수한다 |

**구조가 어긋나면 앱 코드가 이긴다.** 이 문서를 고친다.

## 지켜야 하는 것

**색** — 강조는 `--accent` 파랑 하나뿐이다. 상태색은 `--danger`(빨강: 필수 표시, 재고 0)와 `--good`(초록: 마진율 등 양수) 둘뿐. 배지는 파랑(진행/신규)과 회색(완료/비활성) 두 가지로만 구분한다. **여기 없는 색을 새로 만들지 않는다.**

**여백** — 아래 값만 쓴다. 사이값을 만들지 않는다.

| 자리 | 값 |
|---|---|
| 페이지 바깥 | 16px |
| 패널 안쪽 | 30px |
| 패널 사이 / 좌우 단 사이 | 16px |
| 패널 제목 아래 | 24px |
| 섹션 사이 | 24px |
| 필드 사이 | 22px |
| 라벨 → 입력 | 8px |
| 인라인 요소 사이 | 6 / 8 / 16px |
| 목록 행 사이 | 4px |

**타이포** — 6단계뿐이다. `.t-logo` 22 / `.t-h1` 24 / `.t-h2` 20 / `.t-h3` 16 / `.t-section` 15 / 본문 14 / `.t-caption` 13. 이 사이의 크기를 새로 만들지 않는다.

**반경** — 패널 16 / 대형 CTA 10 / 입력·행·드롭다운 8 / 버튼·라벨·체크박스 6 / 칩 알약. 그 외 값 금지.

**숫자** — 수량·금액은 오른쪽 정렬 + `font-variant-numeric: tabular-nums` (`.num`, `.f-input.num`, `.otable tbody td` 기본). 숫자 때문에 폰트를 바꾸지 않는다.

## 정적 HTML로 그린다 (필수)

최종 목적지가 **Figma 임포트**라서, 브라우저에서만 살아있는 것은 임포트하면 통째로 사라진다.

1. `<script>`를 아예 넣지 않는다. 목록·합계·건수·진행률은 미리 계산해서 값으로 박는다.
2. `<input>` / `<select>` / `<textarea>`를 쓰지 않는다. 대신
   `.f-input`(플레이스홀더는 `.f-input.ph`), `.f-select` + `<span class="caret">▾</span>`,
   `.f-textarea`, `.f-search`, `.f-filter`, `.f-check`, `.f-switch` 를 쓴다 — 전부 `div`/`span`이다.
3. `position:sticky`, `position:fixed`, `height:100vh`, `min-height:100vh`, `overflow-y:auto` 금지.
   하단 액션바·사이드바·모달 전부 일반 흐름으로 둔다. 사이드바는 `position:fixed`가 아니라
   `.page`의 flex 자식이므로 그대로 임포트된다.
4. 상태가 여러 개인 화면은 **정보가 가장 많은 상태 하나**만 그린다. 빈 상태를 따로 보여줘야 하면 파일을 나눈다.
5. 오버레이 모달은 `position:static` + 여백으로 본문 아래에 이어 붙인다.

인터랙션 시연이 꼭 필요하면 정적 파일을 기본으로 두고, 그 화면만 `_interactive.html`을 따로 만든다.
그때도 순수 JS 인라인 `<script>` 하나로, **보여주기로 한 딱 그 인터랙션만** 구현한다 (비즈니스 로직 구현 금지).

## 참고 파일

- [reference/ondo.css](reference/ondo.css) — 페이지에 통째로 붙여넣는 스타일시트
- [reference/catalog.html](reference/catalog.html) — 컴포넌트 전량. 브라우저로 열어서 눈으로 고르고 마크업을 복사
- [reference/figma-map.md](reference/figma-map.md) — Figma node-id 대조표, 토큰 출처, Figma 쪽 불일치와 이 시스템이 내린 결정
- `~/feature-spec/wholesale_screen_spec.md` — 도매 화면에 **무엇이 들어가는지**(탭·필드·상태값·업무 흐름)의 원본.
  이 스킬은 보이는 방식만 다루므로, 화면 내용을 정할 땐 그쪽을 먼저 본다.
