# @ondo/api

도매·소매 API를 **부르는 방법**만 담는다. 화면도, 도메인 판단도 여기 두지 않는다.

## 스펙은 서버에만 있다

백엔드(`ondo-commerce/ondo-api`)는 `openapi.yaml` 파일을 커밋하지 않는다. 스펙은
springdoc이 코드에서 만들어 **런타임에만** 존재한다 — `GET :8081/v3/api-docs`.

그런데 CI와 Vercel 빌드에는 그 서버가 없다. 그래서 명령을 둘로 갈랐다.

| 명령 | 서버 | 하는 일 |
|---|---|---|
| `pnpm --filter @ondo/api sync-spec` | **필요** | 스펙을 받아 키를 정렬해 `openapi/wholesale.json`에 굳히고, 이어서 `codegen` |
| `pnpm codegen` | 불필요 | 커밋된 스냅샷 → `src/generated/`. 결정적이라 CI가 drift를 잡을 수 있다 |

**BE가 스펙을 바꿨다고 알려오면 `sync-spec`을 돌린다.** 스냅샷과 생성물을 한 커밋에 올린다.
CI가 잡아주는 건 "스냅샷 ↔ 생성물"까지다 — **서버와 스냅샷이 어긋나는 건 사람만 막을 수 있다.**

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

## 지금 미완인 것

`openapi/wholesale.json` 스냅샷이 아직 없다 — 도매 API 서버를 로컬에서 띄우지 못해서다
(Docker 미설치 · JDK 21 필요, 현재 17).

그래서 `package.json`에 **`codegen` 스크립트를 아직 넣지 않았다.** 넣어 두면 스냅샷이 없는
상태에서 `pnpm typecheck`가 레포 전체에서 죽는다. 스냅샷을 얻으면 그 커밋에서 함께 넣는다:

```jsonc
"codegen": "openapi-typescript ./openapi/wholesale.json -o ./src/generated/wholesale.d.ts"
```

그 시점부터 `.github/workflows/ci.yml`의 drift 체크가 실제로 동작한다.
