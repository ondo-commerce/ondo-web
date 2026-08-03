# CONTRIBUTING

규칙의 **원본은 `docs/`**에 있다. 이 문서는 매일 보는 것만 요약한다.

## 브랜치

```
main   보호됨. 직접 push 금지. 데모/발표는 여기
dev    통합 브랜치. 고정 Preview
feat-<이슈번호>-<요약>   수명 3일, 동시 2개까지
```

- `feat` → `dev` : **Squash merge**
- `dev` → `main` : **Merge commit**
- `dev` 동기화는 `git rebase dev` (merge commit 금지)
- 전문: [docs/03-git.md](docs/03-git.md)

## 커밋

```
<type>(<scope>): <subject>
```

`type` = feat / fix / refactor / chore / docs / test / style / perf
`scope` = 앱 또는 패키지 이름 (`wholesale`, `retail`, `ui`, `api`, `shared`, `config`)

## import 방향 (단방향)

```
app → features → shared → packages
```

- 다른 feature의 **내부 파일**을 직접 import 하지 않는다. `features/<name>/index.ts`(public API)만 사용
- 2단계 이상 상대경로(`../../`) 금지 → `@/` alias
- 전문: [docs/02-folder-structure.md](docs/02-folder-structure.md)

## Server / Client 경계 (App Router)

1. `"use client"`는 **잎(leaf) 컴포넌트에** 붙인다. 페이지 최상단 금지
2. 소매(retail) 목록·상세·검색은 **Server Component fetch**, 도매(wholesale) 어드민 화면은 **Client + TanStack Query**
3. Server → Client로 넘기는 값은 **직렬화 가능한 형태만** (Date는 ISO string)

## 되돌리기 비싼 결정을 바꿀 때

폴더 구조 / 상태관리 / 라우팅 규칙 / 의존성 추가는 **ADR을 먼저 쓴다.**
[docs/adr/0000-template.md](docs/adr/0000-template.md) 복사 → PR에 링크.
