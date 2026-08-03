# 10. Vercel 배포 직접 해보기 (실습)

> **이 문서는 답안지가 아니라 실습 순서다.**
> 각 단계에 **"예상해보기"** 칸이 있다. 클릭하기 전에 결과를 먼저 예측하고, 틀리면 그 지점이 내가 모르던 부분이다.
> 소요: 첫 앱 40분, 두 번째 앱 10분.

## 전제

- `ondo-web` 레포가 GitHub에 올라가 있고 `apps/wholesale`, `apps/retail`이 로컬에서 각각 `pnpm dev`로 뜬다
- 아직 안 됐으면 여기서 멈추고 스캐폴딩 먼저 → [01](01-repository.md), [02](02-folder-structure.md)

## 이 실습에서 실제로 배우는 것

| 개념 | 왜 중요한가 |
|---|---|
| 빌드 루트 ≠ 레포 루트 | 모노레포 배포의 거의 모든 문제가 여기서 나온다 |
| 환경변수의 2차원 스코프 (프로젝트 × 환경) | "로컬은 되는데 배포는 안 됨"의 최대 원인 |
| 빌드 스킵 판단의 주체 | Vercel이 아니라 `turbo-ignore`가 한다. 이걸 알면 CI 최적화가 보인다 |
| Preview / Production 분리 | 롤백·QA·데모 전략이 전부 여기서 파생된다 |

---

## Step 1. 첫 프로젝트 생성 — 일부러 틀리게 해본다

Vercel → Add New → Project → `ondo-web` import.

**Root Directory를 건드리지 말고 그대로 Deploy를 누른다.**

> ### 🔮 예상해보기
> 빌드가 성공할까, 실패할까? 실패한다면 어떤 메시지일까?

<details>
<summary>결과 확인 (먼저 예상한 뒤에 펼칠 것)</summary>

실패한다. Vercel이 레포 루트에서 Next.js 앱을 찾는데 루트에는 `apps/`와 `packages/`만 있다.
로그에 `No Next.js version detected` 또는 빌드 명령이 아무것도 안 하고 끝나는 형태로 나온다.

**여기서 얻는 것**: Vercel은 "레포"가 아니라 **"하나의 빌드 가능한 디렉토리"**를 배포한다. 모노레포는 그 디렉토리가 레포 루트가 아니다.
</details>

---

## Step 2. Root Directory 설정

Project Settings → General → Root Directory → `apps/wholesale`

바로 아래 **"Include files outside of the Root Directory"** 를 켠다.

> ### 🔮 예상해보기
> 이 체크박스를 끄면 어떤 에러가 날까? `apps/wholesale`은 무엇을 필요로 하는가?

<details>
<summary>결과 확인</summary>

끄면 `packages/ui`, `packages/api`를 못 찾아서 모듈 해석 에러가 난다. 루트의 `pnpm-lock.yaml`, `pnpm-workspace.yaml`도 못 읽어서 설치 자체가 깨진다.

**여기서 얻는 것**: 빌드 루트는 `apps/wholesale`이지만 **의존성 그래프는 레포 전체**다. 이 둘이 다르다는 게 모노레포 배포의 핵심.
</details>

Redeploy → 이번엔 성공해야 한다. 실패하면 로그의 첫 번째 빨간 줄만 읽고 검색해보기.

---

## Step 3. 스타일이 깨지는지 확인 ★

배포된 URL을 열어본다. **Tailwind `content`에 `packages/ui`를 안 넣었다면 여기서 처음 티가 난다.**

> ### 🔮 예상해보기
> 로컬 `pnpm dev`에서는 멀쩡한데 배포에서만 깨진다면, 왜 그럴까?

<details>
<summary>결과 확인</summary>

로컬 dev는 Tailwind JIT가 파일을 감시하며 클래스를 즉석에서 만든다. 프로덕션 빌드는 `content` 경로를 한 번 스캔해서 **거기 없는 클래스를 전부 버린다(purge)**.
`packages/ui`가 content에 없으면 공유 컴포넌트 스타일만 통째로 사라진다.

```ts
content: [
  "./src/**/*.{ts,tsx}",
  "../../packages/ui/src/**/*.{ts,tsx}",   // ← 이 줄
],
```

**여기서 얻는 것**: `pnpm build && pnpm start`로 **로컬에서 프로덕션 빌드를 확인하는 습관**. dev 서버만 믿으면 안 된다.
</details>

> 깨지지 않았다면 이미 설정을 넣어둔 것이다. 일부러 그 줄을 지우고 재배포해서 증상을 한 번 보는 걸 권한다. **증상을 본 사람만 나중에 원인을 떠올린다.**

---

## Step 4. 환경변수

Settings → Environment Variables. 각 변수에 Production / Preview / Development 체크박스가 있다.

`NEXT_PUBLIC_API_BASE_URL`을 **Production은 실서버, Preview는 스테이징**으로 서로 다르게 넣어본다.

> ### 🔮 예상해보기
> 1. 환경변수를 추가하면 이미 배포된 사이트에 즉시 반영될까?
> 2. `NEXT_PUBLIC_` 접두사가 없는 변수를 클라이언트 컴포넌트에서 쓰면?

<details>
<summary>결과 확인</summary>

1. **반영 안 된다. 재배포해야 한다.** `NEXT_PUBLIC_*`는 빌드 시점에 코드에 문자열로 박힌다(inline). 런타임에 읽는 값이 아니다
2. `undefined`가 된다. 서버 전용 변수는 클라이언트 번들에 포함되지 않는다 — 이건 버그가 아니라 **비밀값 유출을 막는 안전장치**다

**여기서 얻는 것**: "환경변수 바꿨는데 왜 그대로지?" 의 답. 그리고 왜 `env.ts`에서 zod로 검증해 **빌드를 실패시키는지** — 런타임에 `undefined`로 조용히 깨지는 것보다 빌드가 터지는 게 낫다.
</details>

로컬로 받아오기:
```bash
vercel link          # apps/wholesale 안에서 실행
vercel env pull .env.local
```

---

## Step 5. 두 번째 프로젝트 (retail)

**가이드를 보지 말고 처음부터 혼자 해본다.** 같은 레포를 다시 import → Root Directory `apps/retail`.

막히면 그때 Step 1~4를 다시 본다. **혼자 되면 이해한 것이고, 봐야 하면 아직 안 된 것이다.**

프로젝트 이름은 `ondo-wholesale` / `ondo-retail`로.

---

## Step 6. turbo-ignore — 빌드 스킵

지금 상태에서 `apps/retail`의 파일 하나만 고쳐 push 해본다.

> ### 🔮 예상해보기
> Vercel 프로젝트 2개 중 몇 개가 빌드될까?

<details>
<summary>결과 확인</summary>

**2개 다 빌드된다.** Vercel은 기본적으로 "이 레포에 커밋이 왔다 → 내 프로젝트를 빌드한다"만 판단한다. 어느 앱이 바뀌었는지는 모른다.

Settings → Git → **Ignored Build Step** → `npx turbo-ignore`

이제 다시 push 하면 관계없는 쪽은 `Build skipped` 로 끝난다.
</details>

**추가 실험**: `packages/ui`의 파일을 고쳐서 push 해본다.

> ### 🔮 예상해보기
> 이번엔 몇 개가 빌드될까?

<details>
<summary>결과 확인</summary>

**2개 다.** `turbo-ignore`는 의존성 그래프를 읽어서 "이 변경이 내 앱에 영향을 주는가"를 판단한다. 두 앱 모두 `packages/ui`에 의존하므로 둘 다 빌드하는 게 맞다.

**여기서 얻는 것**: 빌드 스킵은 Vercel이 아니라 **Turborepo가 의존성 그래프로 판단**한다. `--filter="...[origin/main]"`으로 CI를 최적화하는 것과 같은 원리다.
</details>

---

## Step 7. Preview 배포 흐름

`feat-1-test` 브랜치를 만들고 아무 텍스트나 바꿔서 PR을 연다.

확인할 것:
- [ ] PR에 Vercel 봇이 Preview URL을 코멘트로 달았는가
- [ ] 그 URL에서 변경사항이 보이는가
- [ ] Production 도메인은 그대로인가
- [ ] Preview에서 Preview용 환경변수가 적용됐는가 (Step 4에서 다르게 넣었다면 확인 가능)

> ### 🔮 예상해보기
> PR에 커밋을 하나 더 push 하면 Preview URL이 바뀔까?

<details>
<summary>결과 확인</summary>

배포마다 고유 URL이 새로 생기지만, **브랜치 단위 alias URL은 유지된다.** PR 코멘트는 갱신된다.
`dev` 브랜치에 고정 도메인을 붙여두면 QA·데모용으로 항상 같은 주소를 쓸 수 있다 → [09 § 4](09-monorepo-architecture.md)
</details>

---

## Step 8. 롤백 해보기

`main`에 머지해서 Production 배포를 한 번 낸 뒤, Deployments 목록에서 **이전 배포 → ⋯ → Promote to Production**.

> ### 🔮 예상해보기
> 롤백에 시간이 얼마나 걸릴까? 다시 빌드할까?

<details>
<summary>결과 확인</summary>

**재빌드하지 않는다. 수십 초 안에 끝난다.** 이미 빌드된 산출물이 그대로 남아있고 도메인이 가리키는 대상만 바꾸는 것이다.

**여기서 얻는 것**: 1인 운영에서 가장 강력한 안전장치. "배포했다가 문제 생기면 어쩌지"의 답이 여기 있다. 이걸 **평온할 때 한 번 해봐야** 급할 때 손이 움직인다.
</details>

---

## 마지막: 도메인 연결 (도메인이 준비됐을 때)

Settings → Domains → `b2b.example.com` 추가 → 안내되는 CNAME/A 레코드를 DNS에 등록.
- 전파에 몇 분~몇 시간
- HTTPS 인증서는 Vercel이 자동 발급

---

## 완료 체크리스트

- [ ] Root Directory를 안 바꾸면 왜 실패하는지 **말로 설명할 수 있다**
- [ ] "Include files outside root"가 무엇을 위한 옵션인지 안다
- [ ] Tailwind purge로 스타일이 사라지는 증상을 **직접 봤다**
- [ ] `NEXT_PUBLIC_*`가 빌드 시점에 박힌다는 걸 안다
- [ ] Preview/Production 환경변수를 다르게 설정했다
- [ ] `turbo-ignore` 적용 전후의 빌드 개수 차이를 **직접 봤다**
- [ ] `packages/ui` 변경 시 두 앱이 모두 빌드되는 이유를 안다
- [ ] PR → Preview URL 흐름을 직접 확인했다
- [ ] 롤백을 한 번 해봤다

**9개 중 8개 이상 체크되면 이 영역은 끝난 것이다.**

---

## 막혔을 때

먼저 혼자 15분 시도해보고, 그 다음에 물어본다. 물어볼 때는 이 형식으로:

```
1. 무엇을 하려 했나
2. 어떻게 될 거라 예상했나
3. 실제로 뭐가 나왔나 (에러 로그 원문)
4. 뭘 시도해봤나
```

**3번(로그 원문)이 가장 중요하다.** Vercel 빌드 로그의 첫 번째 에러 줄에 답이 있는 경우가 대부분이고, 그 아래 수십 줄은 파생된 노이즈다. **로그를 위에서부터 읽는 습관**이 이 실습에서 가져갈 것 중 하나다.
