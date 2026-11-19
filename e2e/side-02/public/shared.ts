import { expect, test, type Page } from "@playwright/test";

/**
 * production 공개 스모크가 같이 쓰는 것. side-02 S3(#278).
 *
 * `PUBLIC_SMOKE=1`이 없으면 spec 전체를 건너뛴다 — 네트워크와 production 상태에
 * 매달린 테스트라 실수로 돌면 안 된다. 스크립트(`pnpm e2e:public`,
 * `pnpm e2e:public:anon`)가 넣어 준다.
 */
export function gatePublicSmoke(): void {
  test.skip(
    process.env.PUBLIC_SMOKE !== "1",
    "production 스모크는 PUBLIC_SMOKE=1 일 때만 돈다(pnpm e2e:public)",
  );
}

/**
 * 로그인 계정. 이메일은 공개 시드 계정(docs/12-demo-guide.md)이 기본값이고,
 * **비밀번호는 환경변수로만** 받는다(`PUBLIC_PW`). 없으면 로그인 점검은 skip이 아니라
 * **실패**한다 — skip이면 `pnpm e2e:public`이 18화면을 하나도 안 보고 성공했다
 * (03-review F14). 로그인 없이 볼 화면만 돌리려면 `pnpm e2e:public:anon`.
 */
export const PUBLIC_ACCOUNT = {
  wholesale: process.env.PUBLIC_W_EMAIL ?? "raon@ondo.test",
  retail: process.env.PUBLIC_R_EMAIL ?? "bombom@ondo.test",
} as const;

export function requirePassword(): string {
  const password = process.env.PUBLIC_PW;
  if (!password) {
    throw new Error(
      "PUBLIC_PW가 없다. 로그인 점검은 공개 계정 비밀번호가 있어야 돈다 — 미로그인 점검만이면 pnpm e2e:public:anon",
    );
  }
  return password;
}

/** 로그인 세션 파일. 세션 쿠키가 들어 있어 비밀 취급 — `.gitignore`의 `e2e/.auth/` */
export const AUTH_FILE = {
  wholesale: "e2e/.auth/public-wholesale.json",
  retail: "e2e/.auth/public-retail.json",
} as const;

/**
 * 화면에 보이는 글자 **전부**에서 세는 말. 더미 상호(`봄봄상회` 하드코딩, 계좌 스텁의
 * `서울유통`), 자리표시, 영문 404, 사실이 아닌 안내, 막다른 "준비 중".
 *
 * 예전엔 "준비 중"을 다이얼로그·카드 같은 지정 자리에서만 셌다가 상품 등록 본문의
 * 업로드 안내(그냥 `<p>`)를 놓쳤다(03-review 7, 04-qa F7). 이제 본문 전체를 센다.
 */
export const FORBIDDEN = [
  "준비 중",
  "Placeholder",
  "TODO",
  "예시 값",
  "서버가 없어요",
  "봄봄상회",
  "서울유통",
  "This page could not be found",
] as const;

/**
 * 글자 덩어리 **전체가** 이 값이면 진짜 상태 배지라 뺀다. 주문·출고 상태
 * `WAITING_SHIPMENT`, `PREPARING`의 화면 이름이 "준비 중"이다(소매
 * `features/order/constants.ts`). 문장 속 "준비 중"은 그대로 센다.
 */
export const STATUS_BADGE_TEXTS = ["준비 중"] as const;

/**
 * 알고 남기는 문장. 하나씩 이유를 적는다 — 이유 없는 예외는 넣지 않는다.
 */
export const ALLOWED_TEXTS = [
  /* 상품 등록 이미지 칸(PostImageGrid.tsx). 업로드 API(`POST /listing-images`)가
     BE에 없어 FE가 막아 둔 자리다. BE 요청 #280(B6)이 닫히면 이 줄을 지운다 */
  "이미지 업로드는 준비 중이에요",
] as const;

export interface ForbiddenScan {
  /** 걸린 것. `url | 단어 | <태그> | 글자` */
  hits: string[];
  /** 허용 목록에 걸려 뺀 것. 같은 꼴이다 — 스모크가 그 문장을 **보긴 했다**는 증거 */
  allowed: string[];
}

/** 보이는 글자 노드를 전부 훑는다. script/style과 숨긴 요소는 뺀다 */
export async function forbiddenScan(page: Page): Promise<ForbiddenScan> {
  const raw = await page.evaluate(
    (words) => {
      const out: { word: string; tag: string; text: string }[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement;
        if (!el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName))
          continue;
        if (!el.checkVisibility()) continue;
        const text = (walker.currentNode.textContent ?? "").trim();
        for (const word of words) {
          if (text.includes(word)) {
            out.push({ word, tag: el.tagName.toLowerCase(), text });
          }
        }
      }
      return out;
    },
    FORBIDDEN as unknown as string[],
  );

  const scan: ForbiddenScan = { hits: [], allowed: [] };
  for (const { word, tag, text } of raw) {
    if ((STATUS_BADGE_TEXTS as readonly string[]).includes(text)) continue;
    const line = `${page.url()} | ${word} | <${tag}> | ${text.slice(0, 60)}`;
    if (ALLOWED_TEXTS.some((allowed) => text.includes(allowed))) {
      scan.allowed.push(line);
    } else {
      scan.hits.push(line);
    }
  }
  return scan;
}

export async function forbiddenHits(page: Page): Promise<string[]> {
  return (await forbiddenScan(page)).hits;
}

export async function expectNoForbidden(page: Page): Promise<void> {
  expect(await forbiddenHits(page)).toEqual([]);
}

/** 막다른 길이던 다이얼로그를 열어 본문까지 센다 */
export async function openDialog(page: Page, trigger: string): Promise<void> {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
