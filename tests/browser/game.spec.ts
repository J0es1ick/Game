import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          return (
            animation.playState === "running" &&
            effect?.getTiming().iterations !== Infinity &&
            effect?.target?.checkVisibility()
          );
        })
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

test("settings persist, dark screens remain readable and autostart can be paused", async ({
  page,
}) => {
  await createHero(page);
  const navigation = page.getByRole("navigation", { name: "Разделы игры" });
  await navigation
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Тема", exact: true })
    .selectOption("dark");
  await page.getByRole("checkbox", { name: "Меньше анимаций" }).check();
  await page
    .getByRole("checkbox", { name: "Начинать бой автоматически" })
    .check();
  await page
    .getByRole("combobox", { name: "Скорость боя", exact: true })
    .selectOption("900");
  await noOverflow(page);
  await accessible(page);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Тема", exact: true }),
  ).toHaveValue("dark");
  await expect(
    page.getByRole("checkbox", { name: "Начинать бой автоматически" }),
  ).toBeChecked();
  await page.locator(".header-save-menu > summary").click();
  const saveMenu = page.locator(".header-save-popover");
  await expect(
    saveMenu.getByRole("button", { name: "Скачать сохранение" }),
  ).toBeVisible();
  await expect(
    saveMenu.getByRole("button", { name: "Загрузить из файла" }),
  ).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await page.locator(".header-save-menu > summary").click();
  for (const name of [
    "Герой",
    "Снаряжение",
    "Навыки",
    "Кузница",
    "Коллекции",
    "Лавка",
    "Рейтинги",
    "Мир",
    "Реликвии",
    "Карта",
  ]) {
    await navigation
      .getByRole("button", { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) })
      .click();
    await noOverflow(page);
    await accessible(page);
  }
  await page
    .getByRole("button", { name: "Начать дуэль", exact: true })
    .first()
    .click();
  const battle = page.getByRole("dialog");
  await battle.getByRole("button", { name: "Пауза", exact: true }).click();
  await battle
    .getByRole("combobox", { name: "Скорость боя" })
    .selectOption("160");
  await expect(
    battle.getByText("Бой на паузе").or(battle.getByText("Готовы к бою?")),
  ).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await battle.getByRole("button", { name: "Настройки боя" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  await expect(
    settings.getByRole("combobox", { name: "Скорость боя" }),
  ).toHaveValue("160");
  await settings
    .getByRole("combobox", { name: "Скорость боя" })
    .selectOption("900");
  await settings
    .getByRole("checkbox", { name: "Начинать бой автоматически" })
    .uncheck();
  await accessible(page);
  await settings.getByRole("button", { name: "Вернуться к бою" }).click();
  await expect(
    battle.getByRole("combobox", { name: "Скорость боя" }),
  ).toHaveValue("900");
  await battle.getByRole("button", { name: "Пропустить бой" }).click();
  await expect(battle.locator(".battle-result")).toBeVisible();
  await accessible(page);
  await battle.getByRole("button", { name: "Продолжить игру" }).click();
  await navigation
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Повторить обучение" }).click();
  await accessible(page);
});

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

test("battle preparation, pause and reload preserve the fight until the player continues", async ({
  page,
}) => {
  await createHero(page);
  await page
    .getByRole("button", { name: "Начать дуэль", exact: true })
    .first()
    .click();
  const battle = page.getByRole("dialog");
  await expect(
    battle.getByRole("heading", { name: "Оцените соперника" }),
  ).toBeVisible();
  await expect(
    battle.getByRole("table", { name: "Характеристики участников" }),
  ).toBeVisible();
  await expect(battle.getByText("ХОД 0", { exact: true })).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await expect(battle.getByText("ХОД 0", { exact: true })).toBeVisible();
  await battle.getByRole("button", { name: "Настройки боя" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  await settings
    .getByRole("combobox", { name: "Скорость боя" })
    .selectOption("900");
  await settings.getByRole("button", { name: "Вернуться к бою" }).click();
  await battle.getByRole("button", { name: "Начать бой", exact: true }).click();
  await expect(battle.getByText("ХОД 1", { exact: true })).toBeVisible();
  await battle.getByRole("button", { name: "Пауза", exact: true }).click();
  const progress = await battle.locator(".battle-action > span").innerText();
  const readMeters = () =>
    battle
      .getByRole("progressbar")
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.getAttribute("aria-label"),
          element.getAttribute("aria-valuenow"),
        ]),
      );
  const health = await readMeters();
  await page.reload();
  await expect(
    battle.getByRole("button", { name: "Продолжить бой", exact: true }),
  ).toBeVisible();
  await expect(battle.locator(".battle-action > span")).toHaveText(progress);
  expect(await readMeters()).toEqual(health);
  await battle
    .getByRole("button", { name: "Пропустить бой", exact: true })
    .click();
  await expect(battle.locator(".battle-reward-strip")).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await battle
    .getByRole("button", { name: "Продолжить игру", exact: true })
    .click();
  await expect(battle).toBeHidden();
  const day = page
    .getByText("День мира", { exact: true })
    .locator("..")
    .getByRole("definition");
  await expect(day).toHaveText("2");
  await page.reload();
  await expect(day).toHaveText("2");
});
