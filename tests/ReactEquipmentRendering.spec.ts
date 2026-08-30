import { createElement, act as reactAct, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { EQUIPMENT_SETS, SLOT_LABELS } from "../src/catalogs/WorldCatalog";
import type { EquipmentItem } from "../src/gameplay/core/WorldTypes";
import { InventoryPage } from "../src/web/react/features/equipment/pages/InventoryPage/InventoryPage";
import { ForgePage } from "../src/web/react/features/equipment/pages/ForgePage/ForgePage";
import { SkillsPage } from "../src/web/react/features/equipment/pages/SkillsPage/SkillsPage";
import { ShopPage } from "../src/web/react/features/equipment/pages/ShopPage/ShopPage";
import { LegacySalvage } from "../src/web/react/features/equipment/components/LegacySalvage/LegacySalvage";
import { LegacyPage } from "../src/web/react/features/equipment/pages/LegacyPage/LegacyPage";
import { HeroPage } from "../src/web/react/features/equipment/pages/HeroPage/HeroPage";

jest.mock("../src/web/react/features/equipment/styles/components.css", () => ({}));
jest.mock("../src/web/react/app/state/GameContext", () => ({
  useGame: () => mockContext,
}));

const { JSDOM } = require("jsdom");
let mockContext: {
  game: WorldGame;
  revision: number;
  act: <T>(action: (game: WorldGame) => T) => T;
  notify: jest.Mock;
  openDialog: jest.Mock;
  closeDialog: jest.Mock;
};

describe("React equipment updates", () => {
  let root: Root;
  let container: HTMLDivElement;
  let current: ComponentType;
  let dom: InstanceType<typeof JSDOM>;
  const globals = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originals = new Map(
    globals.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.test/Game/",
    });
    globals.forEach((key) =>
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
      }),
    );
    dom.window.confirm = jest.fn(() => true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const game = WorldGame.create("Проверка", "Knight", 914);
    game.save.hero.temperingMarks = 50;
    mockContext = {
      game,
      revision: 0,
      notify: jest.fn(),
      openDialog: jest.fn(),
      closeDialog: jest.fn(),
      act: (action) => {
        const result = action(game);
        mockContext.revision += 1;
        root.render(createElement(current));
        return result;
      },
    };
  });

  afterEach(() => {
    reactAct(() => root.unmount());
    dom.window.close();
    originals.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  });

  const render = (component: ComponentType) => {
    current = component;
    reactAct(() => root.render(createElement(component)));
  };
  const click = (button: Element) =>
    reactAct(() => (button as HTMLButtonElement).click());
  const changeSelect = (selector: string, value: string) =>
    reactAct(() => {
      const select = container.querySelector<HTMLSelectElement>(selector)!;
      select.value = value;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  const Away = () => createElement("p", null, "Другая вкладка");
  const buttons = (scope: Element, text: string) =>
    Array.from(scope.querySelectorAll("button")).filter((button) =>
      button.textContent?.startsWith(text),
    );
  const addItem = (id: string, overrides: Partial<EquipmentItem> = {}) => {
    const item = {
      ...mockContext.game.save.hero.inventory[0],
      id,
      ...overrides,
    };
    mockContext.game.save.hero.inventory.push(item);
    return item;
  };

  it("keeps inventory cards, art and focus mounted when taking equipment off", () => {
    render(InventoryPage);
    const card = container.querySelector<HTMLElement>(
      "#inventory-grid .item-card.equipped",
    )!;
    const button = buttons(card, "Снять")[0];
    const artwork = card.querySelector("svg");
    button.focus();
    for (let index = 0; index < 6; index += 1) {
      click(button);
      expect(
        container.querySelector(`[data-item-id="${card.dataset.itemId}"]`),
      ).toBe(card);
      expect(card.querySelector("svg")).toBe(artwork);
      expect(button.textContent).toBe(index % 2 ? "Снять" : "Надеть");
      expect(document.activeElement).toBe(button);
    }
  });

  it("removes only a sold card and preserves the other card nodes", () => {
    const extra = addItem("extra-sale");
    render(InventoryPage);
    const soldCard = container.querySelector(`[data-item-id="${extra.id}"]`)!;
    const other = Array.from(
      container.querySelectorAll("#inventory-grid .item-card"),
    ).find((card) => card !== soldCard)!;
    click(buttons(soldCard, "Продать")[0]);
    expect(container.contains(soldCard)).toBe(false);
    expect(container.contains(other)).toBe(true);
  });

  it("uses the bulk-sale quote and keeps world relics protected", () => {
    const unused = addItem("bulk-unused", { price: 200 });
    const relic = addItem("bulk-world-relic", {
      price: 2_000,
      rarity: "relic",
      worldRelicId: "world-relic-protected",
    });
    const quote = mockContext.game.sellUnequippedQuote();
    expect(quote).toEqual({ count: 1, value: 90 });

    render(InventoryPage);
    const control = container.querySelector<HTMLButtonElement>(
      "#inventory-sell-unequipped",
    )!;
    expect(control.disabled).toBe(false);
    expect(control.textContent).toContain("Продать неиспользуемое · 1");
    expect(control.textContent).toContain("90 ¤ · реликвии останутся");

    click(control);

    expect(dom.window.confirm).toHaveBeenCalledWith(
      "Продать 1 неиспользуемых предметов за 90 ¤? Надетые вещи, регалии короны и мировые реликвии останутся у героя.",
    );
    expect(
      mockContext.game.save.hero.inventory.some(
        (item) => item.id === unused.id,
      ),
    ).toBe(false);
    expect(
      mockContext.game.save.hero.inventory.some((item) => item.id === relic.id),
    ).toBe(true);
    expect(control.disabled).toBe(true);
    expect(control.textContent).toContain("Нет неиспользуемых вещей");
    expect(control.textContent).toContain(
      "Надетое, регалии и реликвии защищены",
    );
  });

  it("bounds inventory pages and reaches items beyond the first page", () => {
    Array.from({ length: 50 }, (_, index) => addItem(`extra-${index}`));
    render(InventoryPage);
    expect(
      container.querySelectorAll("#inventory-grid .item-card"),
    ).toHaveLength(24);
    click(buttons(container, "Далее")[0]);
    expect(
      container.querySelectorAll("#inventory-grid .item-card"),
    ).toHaveLength(24);
    expect(container.textContent).toContain("25–48");
  });

  it("keeps a forge card in place after an upgrade and lazily opens reforge controls", () => {
    mockContext.game.save.hero.temperingMarks = 1000;
    render(ForgePage);
    const card = container.querySelector<HTMLElement>(".forge-card")!;
    const button = buttons(card, "Улучшить")[0];
    expect(card.querySelector(".reforge-control-body")).toBeNull();
    const artwork = card.querySelector("svg");
    button.focus();
    for (let index = 1; index <= 4; index += 1) {
      click(button);
      expect(
        container.querySelector(`[data-item-id="${card.dataset.itemId}"]`),
      ).toBe(card);
      expect(card.querySelector("svg")).toBe(artwork);
      expect(card.textContent).toContain(`закалка +${index}/5`);
      expect(document.activeElement).toBe(button);
    }
    const details = card.querySelector("details")!;
    reactAct(() => {
      details.open = true;
      details.dispatchEvent(new dom.window.Event("toggle"));
    });
    expect(card.querySelector(".reforge-control-body")).not.toBeNull();
  });

  it("changes a skill selection without remounting the skill cards", () => {
    mockContext.game.save.hero.level = 20;
    render(SkillsPage);
    const card = container.querySelector("#skill-road .skill-node.selected")!;
    const button = buttons(card, "Убрать")[0];
    button.focus();
    for (let index = 0; index < 6; index += 1) {
      click(button);
      expect(container.contains(card)).toBe(true);
      expect(card.classList.contains("selected")).toBe(Boolean(index % 2));
      expect(button.textContent).toBe(
        index % 2 ? "Убрать из сборки" : "Добавить в сборку",
      );
      expect(document.activeElement).toBe(button);
    }
  });

  it("buys seals without remounting the shop offers or supply buttons", () => {
    mockContext.game.save.hero.gold = 300000;
    render(ShopPage);
    const offer = container.querySelector("#shop-grid .item-card");
    const button = buttons(container, "Купить 5 печатей")[0];
    const before = mockContext.game.save.hero.temperingMarks;
    click(button);
    expect(mockContext.game.save.hero.temperingMarks).toBe(before + 5);
    expect(container.querySelector("#shop-grid .item-card")).toBe(offer);
    expect(buttons(container, "Купить 5 печатей")[0]).toBe(button);
  });

  it("batch dismantling excludes worn items and updates only selected entries", () => {
    mockContext.game.save.unlockedFeatureIds.push("equipment-legacy");
    addItem("salvage-1");
    addItem("salvage-2");
    render(LegacySalvage);
    const worn = container.querySelector(
      ".relic-salvage-card.status-equipped",
    )!;
    expect(worn.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
    const available = Array.from(
      container.querySelectorAll<HTMLInputElement>(".status-available input"),
    );
    click(available[0]);
    click(available[1]);
    click(buttons(container, "Разобрать выбранное")[0]);
    expect(
      mockContext.game.save.hero.inventory.some(
        (item) => item.id === "salvage-1",
      ),
    ).toBe(false);
    expect(
      mockContext.game.save.hero.inventory.some(
        (item) => item.id === "salvage-2",
      ),
    ).toBe(false);
    expect(container.contains(worn)).toBe(true);
  });

  it("restores inventory filters and page when returning from another tab", () => {
    const template = mockContext.game.save.hero.inventory[0];
    for (let index = 0; index < 50; index += 1)
      addItem(`filtered-${index}`, {
        rarity: "epic",
        setId: EQUIPMENT_SETS[0].id,
      });
    render(InventoryPage);
    click(
      buttons(
        container.querySelector("#inventory-filters")!,
        SLOT_LABELS[template.slot],
      )[0],
    );
    changeSelect("#inventory-rarity-filter", "epic");
    changeSelect("#inventory-set-filter", EQUIPMENT_SETS[0].id);
    changeSelect("#inventory-sort", "oldest");
    click(buttons(container, "Далее")[0]);
    const firstItem = container.querySelector<HTMLElement>(
      "#inventory-grid .item-card",
    )!.dataset.itemId;
    render(Away);
    render(InventoryPage);
    expect(
      container.querySelector("#inventory-result-count")!.textContent,
    ).toBe("25–48 из 50");
    expect(
      container.querySelector<HTMLElement>("#inventory-grid .item-card")!
        .dataset.itemId,
    ).toBe(firstItem);
    expect(
      container.querySelector<HTMLSelectElement>("#inventory-rarity-filter")!
        .value,
    ).toBe("epic");
    expect(
      container.querySelector<HTMLSelectElement>("#inventory-set-filter")!
        .value,
    ).toBe(EQUIPMENT_SETS[0].id);
    expect(
      container.querySelector<HTMLSelectElement>("#inventory-sort")!.value,
    ).toBe("oldest");
    expect(
      buttons(
        container.querySelector("#inventory-filters")!,
        SLOT_LABELS[template.slot],
      )[0].getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps forge and legacy pages and pending dismantling selection across navigation", () => {
    mockContext.game.save.unlockedFeatureIds.push("equipment-legacy");
    for (let index = 0; index < 40; index += 1)
      addItem(`remember-${index}`, { rarity: "legendary" });
    render(ForgePage);
    click(buttons(container, "Далее")[0]);
    const forgeItem =
      container.querySelector<HTMLElement>(".forge-card")!.dataset.itemId;
    render(Away);
    render(ForgePage);
    expect(
      container.querySelector<HTMLElement>(".forge-card")!.dataset.itemId,
    ).toBe(forgeItem);
    expect(
      container.querySelector(".equipment-pagination [role=status]")!
        .textContent,
    ).toContain("2 / 3");

    render(LegacyPage);
    click(buttons(container.querySelector("#relic-workshop")!, "Далее")[0]);
    const legacyItem =
      container.querySelector<HTMLElement>(".relic-ready-card")!.dataset
        .relicReadyItemId;
    click(buttons(container, "Разобрать")[0]);
    const salvage = container.querySelector("#legacy-salvage")!;
    click(buttons(salvage, "Далее")[0]);
    const checkbox = salvage.querySelector<HTMLInputElement>(
      ".status-available input",
    )!;
    click(checkbox);
    const selectedName = checkbox.getAttribute("aria-label");
    render(Away);
    render(LegacyPage);
    const restored = container.querySelector("#legacy-salvage")!;
    expect(
      restored.querySelector(".equipment-pagination [role=status]")!
        .textContent,
    ).toContain("2 / 2");
    expect(
      restored.querySelector<HTMLInputElement>(
        `input[aria-label="${selectedName}"]`,
      )!.checked,
    ).toBe(true);
    expect(restored.textContent).toContain("Выбрано: 1");
    click(buttons(container, "Развивать")[0]);
    expect(
      container.querySelector<HTMLElement>(".relic-ready-card")!.dataset
        .relicReadyItemId,
    ).toBe(legacyItem);
  });

  it("renders hero equipment, history and class change as stable pages", () => {
    const HistoryPage = () => createElement(HeroPage, { section: "history" });
    const ClassPage = () => createElement(HeroPage, { section: "class" });
    render(HeroPage);
    expect(container.querySelector("#paper-doll")).not.toBeNull();
    expect(container.querySelector(".hero-history-grid")).toBeNull();
    expect(container.querySelector("#class-change-panel")).toBeNull();

    render(HistoryPage);
    expect(container.querySelector("#paper-doll")).toBeNull();
    expect(container.querySelector(".hero-history-grid")).not.toBeNull();

    render(ClassPage);
    expect(container.querySelector(".hero-history-grid")).toBeNull();
    expect(container.querySelector("#class-change-panel")).not.toBeNull();

    render(Away);
    render(ClassPage);
    expect(container.querySelector("#class-change-panel")).not.toBeNull();
  });

  it("does not carry filters from the previous world into a new game", () => {
    render(InventoryPage);
    changeSelect("#inventory-rarity-filter", "mythic");
    expect(
      container.querySelectorAll("#inventory-grid .item-card"),
    ).toHaveLength(0);
    render(Away);
    mockContext.game = WorldGame.create("Новый герой", "Archer", 931);
    render(InventoryPage);
    expect(
      container.querySelector<HTMLSelectElement>("#inventory-rarity-filter")!
        .value,
    ).toBe("all");
    expect(
      container.querySelectorAll("#inventory-grid .item-card"),
    ).toHaveLength(mockContext.game.save.hero.inventory.length);
  });
});
