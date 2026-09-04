import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({
        target,
        failureSummary,
      })),
    })),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
}

async function createHero(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: /Живой мир/ }).click();
  await page
    .getByRole("textbox", { name: "Имя героя" })
    .fill("Проверка браузера");
  await page.getByRole("radio", { name: /Мечник/ }).click();
  await page.getByRole("button", { name: "Начать путь" }).click();
  await page.getByRole("button", { name: "Пропустить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Карта окрестностей" }),
  ).toBeVisible();
}

test("mode chooser is lightweight and class selection works with the keyboard", async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".js")) scripts.push(response.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Выберите режим" }),
  ).toBeVisible();
  expect(
    scripts.some((url) =>
      /GameApplication|WorldGame|WorldSaveWorker/.test(url),
    ),
  ).toBe(false);
  await noOverflow(page);
  await accessible(page);
  await page.getByRole("button", { name: /Живой мир/ }).click();
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(6);
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(radios.last()).toBeFocused();
  await expect(page.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "К выбору режима" }),
  ).toBeFocused();
  await noOverflow(page);
  await accessible(page);
});

test("hero, battle, saved reload and touch-readable tournament rules", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createHero(page);
  await noOverflow(page);
  await accessible(page);
  await page
    .getByRole("button", { name: "Начать дуэль", exact: true })
    .first()
    .click();
  const battle = page.getByRole("dialog");
  await expect(battle).toBeVisible();
  await battle
    .getByRole("button", { name: "Пропустить бой", exact: true })
    .click();
  await battle
    .getByRole("button", { name: /Завершить|Продолжить|Закрыть/, exact: false })
    .last()
    .click();
  await expect(battle).toBeHidden();
  const worldDay = page
    .getByText("День мира", { exact: true })
    .locator("..")
    .getByRole("definition");
  await expect(worldDay).toHaveText("2");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Карта окрестностей" }),
  ).toBeVisible();
  await expect(
    page.getByText("Проверка браузера", { exact: true }).first(),
  ).toBeVisible();
  await expect(worldDay).toHaveText("2");
  const directions = page.getByRole("navigation", {
    name: "Быстрый доступ к активностям",
  });
  await directions.getByRole("button", { name: /^Турниры/ }).click();
  const rules = page.getByRole("button", {
    name: "Условия турнира «Кубок Нижнего города»",
  });
  await rules.click();
  const dialog = page.getByRole("dialog", {
    name: "Условия: Кубок Нижнего города",
  });
  await expect(
    dialog.getByRole("heading", { name: /Ареной управляет/ }),
  ).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await dialog.getByRole("button", { name: "Понятно" }).click();
  await expect(rules).toBeFocused();
  const navigation = page.getByRole("navigation", { name: "Разделы игры" });
  for (const [name, heading] of [
    ["Герой", "Ваш герой"],
    ["Снаряжение", "Инвентарь"],
    ["Лавка", "Лавка Ионы"],
    ["Рейтинги", "Сотня лучших бойцов"],
    ["Мир", "Обзор мира"],
  ]) {
    await navigation
      .getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    await accessible(page);
  }
  expect(errors).toEqual([]);
});
