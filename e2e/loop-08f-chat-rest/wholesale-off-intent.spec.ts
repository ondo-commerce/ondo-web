import { expect, test, type Page } from "@playwright/test";
import {
  cardLines,
  count,
  knob,
  settled,
  startAt,
  STATS_GET,
  T_1159,
  waitCount,
} from "./helpers";

/**
 * loop-08f #371 S1-5 전부 꺼짐 때 의도 분류가 대시보드 문의 카드 4줄에 보인다(01-plan §4-5, §6 S1-5). 1280.
 *
 * stats-v1(10/29 11:59:30) 손 계산 값은 08 S2-1과 같다: 12건, 넘김 2, 재고 4, 미분류 2.
 * 자동 답을 전부 끄고 방 1(문맥 2001)에 "레드 M 몇 장 있어요?" → OFF 넘김 줄 하나, intent STOCK.
 * 그래서 13건, 넘김 3, 재고 5, 미분류 2(그대로).
 *
 * AC 절차 변경(02-dev §AC 조건 변경): AC는 "주입 → 다음 polling 뒤 +1"인데 11:59:30에서 polling을 당기면
 * (30초) 시계가 12:00을 넘어 오늘 영업일이 10/29로 바뀐다. 그러면 카드가 다른 날을 센다. 그래서 주입을
 * **로그인 전**(첫 stats 요청 전)에 하고 손 계산 값과 비교한다. 원래 절차는 `test.fail`로 남긴다.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const STATS_V1 = "stats-v1";
const QUESTION = "레드 M 몇 장 있어요?";

async function offAndAsk(page: Page): Promise<void> {
  await knob(page, "auto-reply", { enabled: false });
  await knob(page, "rooms/1/incoming", {
    body: QUESTION,
    contextListingId: 2001,
  });
}

test("S1-5 stats-v1 11:59:30, 자동 답 전부 끔 + 방 1 재고 질문 → 4줄 재고 4 → 5, 미분류 2 그대로", async ({
  page,
}) => {
  // 08f C1: `startAt`의 시계는 흐른다. 로그인과 설정이 30초를 넘으면 주입 시각과 첫 stats 요청이 12:00을 넘어
  // 10/29 영업일을 센다. 그래서 주입 전에 11:59:30으로 고정하고(그 전 흐른 시간도 되돌린다), 첫 stats 응답 뒤 다시 흐르게 한다
  await startAt(page, T_1159, {
    seed: STATS_V1,
    before: async (p) => {
      await p.clock.setFixedTime(T_1159);
      await offAndAsk(p);
    },
  });
  await expect.poll(() => count(page, STATS_GET)).toBeGreaterThan(0);
  await settled(page, STATS_GET);
  await page.clock.setSystemTime(T_1159);
  await expect(cardLines(page)).toHaveText([
    "오늘 소매 메시지 13건",
    "자동 답 5, 답+확인 1, 넘김 3, 되묻기 3, 결과 없음 1",
    "자동으로 끝남 56% (5/판정 9)",
    "판정한 것 중 재고 5, 미송 1, 미수 1, 기타 0, 미분류 2",
    "소매 메시지 1개 = 1건, 영업일 낮 12시 경계, 11:59 기준",
  ]);
  await settled(page, STATS_GET);
});

test("S1-5 원래 절차(주입 → 다음 polling 뒤 재고 +1). 11:59:30 + 30초 = 12:00을 넘어 영업일이 바뀌어 실패한다", async ({
  page,
}) => {
  // 실측(11-05): polling 뒤 4줄 "재고 0, 미송 0, 미수 0, 기타 0, 미분류 0" — 10/29 영업일을 센다
  test.fail();
  await startAt(page, T_1159, { seed: STATS_V1 });
  await expect(cardLines(page).nth(3)).toHaveText(
    "판정한 것 중 재고 4, 미송 1, 미수 1, 기타 0, 미분류 2",
  );
  await settled(page, STATS_GET);
  await offAndAsk(page);
  const before = await count(page, STATS_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, STATS_GET, before + 1);
  await settled(page, STATS_GET);
  await expect(cardLines(page).nth(3)).toHaveText(
    "판정한 것 중 재고 5, 미송 1, 미수 1, 기타 0, 미분류 2",
    { timeout: 3_000 },
  );
});
