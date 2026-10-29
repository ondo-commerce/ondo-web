import { expect, test, type Page } from "@playwright/test";
import { JPG } from "./helpers";

/**
 * S1-2 · S1-3 — 업로드 계약 초안(#249)을 **브라우저 MSW 경유**로 확인한다.
 *
 * `page.request` 가 아니라 `page.evaluate` 안의 `fetch` 다 — mock 은 서비스 워커라
 * APIRequestContext 는 그걸 안 탄다(§9-2). 로그인은 필요 없다. `/login` 도 Providers 안이라
 * 화면이 그려졌다는 건 worker 가 떠 있다는 뜻이다.
 */

/** 상한. 앱 상수(`IMAGE_MAX_BYTES`)·목 상수와 같은 값이어야 하고, 어긋나면 여기서 드러난다 */
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

interface Reply {
  status: number;
  contentType: string | null;
  body: {
    data?: { url?: string };
    code?: string;
    message?: string;
    errors?: { field: string }[];
    traceId?: string | null;
  } | null;
}

type Part =
  | { kind: "bytes"; name: string; base64: string }
  | { kind: "zeros"; name: string; size: number; magic: number[] }
  | { kind: "text"; name: string; text: string }
  | { kind: "string"; text: string };

/** 브라우저 안에서 FormData 를 만들어 보낸다. 바이트는 base64 로 넘긴다 */
function upload(page: Page, parts: Part[]): Promise<Reply> {
  return page.evaluate(async (parts) => {
    const fd = new FormData();
    for (const p of parts) {
      if (p.kind === "string") {
        fd.append("file", p.text);
        continue;
      }
      let bytes: Uint8Array;
      if (p.kind === "bytes")
        bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
      else if (p.kind === "zeros") {
        bytes = new Uint8Array(p.size);
        bytes.set(p.magic, 0);
      } else bytes = new TextEncoder().encode(p.text);
      fd.append("file", new File([bytes], p.name, { type: "image/jpeg" }));
    }
    const res = await fetch("/api/wholesale/listing-images", {
      method: "POST",
      body: fd,
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      body: await res.json().catch(() => null),
    };
  }, parts);
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const realJpg = (name = "a.jpg"): Part => ({
  kind: "bytes",
  name,
  base64: JPG.toString("base64"),
});

async function expectError(
  reply: Reply,
  status: number,
  code: string,
  field?: string,
) {
  expect(reply.status).toBe(status);
  expect(reply.body).not.toBeNull();
  const body = reply.body!;
  expect(body.code).toBe(code);
  expect(Object.keys(body).sort()).toEqual([
    "code",
    "errors",
    "message",
    "traceId",
  ]);
  if (field) expect(body.errors?.[0]?.field).toBe(field);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
});

test("S1-2 진짜 jpg → 201 { data: { url } }, url 은 blob:, content-type 은 json", async ({
  page,
}) => {
  const reply = await upload(page, [realJpg()]);
  expect(reply.status).toBe(201);
  expect(reply.contentType).toContain("application/json");
  expect(reply.body?.data?.url).toMatch(/^blob:/);
});

test("S1-3 경계 9건 — 415 · 413 · 상한 동일 201 · 0바이트 400 · 파트 없음/문자열/2개 400 · fail500 · fail500once", async ({
  page,
}) => {
  await expectError(
    await upload(page, [{ kind: "text", name: "a.jpg", text: "hello" }]),
    415,
    "UNSUPPORTED_FILE_TYPE",
  );
  await expectError(
    await upload(page, [
      {
        kind: "zeros",
        name: "big.jpg",
        size: IMAGE_MAX_BYTES + 1,
        magic: JPEG_MAGIC,
      },
    ]),
    413,
    "FILE_TOO_LARGE",
  );
  expect(
    (
      await upload(page, [
        {
          kind: "zeros",
          name: "max.jpg",
          size: IMAGE_MAX_BYTES,
          magic: JPEG_MAGIC,
        },
      ])
    ).status,
  ).toBe(201);
  await expectError(
    await upload(page, [{ kind: "zeros", name: "z.jpg", size: 0, magic: [] }]),
    400,
    "VALIDATION_FAILED",
    "file",
  );
  await expectError(await upload(page, []), 400, "VALIDATION_FAILED", "file");
  await expectError(
    await upload(page, [{ kind: "string", text: "not a file" }]),
    400,
    "VALIDATION_FAILED",
    "file",
  );
  await expectError(
    await upload(page, [realJpg("1.jpg"), realJpg("2.jpg")]),
    400,
    "VALIDATION_FAILED",
    "file",
  );
  await expectError(
    await upload(page, [realJpg("x-fail500.jpg")]),
    500,
    "INTERNAL_ERROR",
  );
  await expectError(
    await upload(page, [realJpg("y-fail500once.jpg")]),
    500,
    "INTERNAL_ERROR",
  );
  expect((await upload(page, [realJpg("y-fail500once.jpg")])).status).toBe(201);
});
