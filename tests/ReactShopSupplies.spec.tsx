import type { RenderResult } from "@testing-library/react/pure";
import type { WorldGame as WorldGameType } from "../src/gameplay/core/WorldGame";
import type { GameStore as GameStoreType } from "../src/web/react/app/state/GameStore";
import {
  createReactEnvironment,
  ReactMemoryStorage,
} from "./helpers/ReactEnvironment";

jest.mock("../src/web/react/features/equipment/styles/components.css", () => ({}));

const environment = createReactEnvironment();
const { cleanup, fireEvent, render, within, act } =
  require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
const { WorldGame } =
  require("../src/gameplay/core/WorldGame") as typeof import("../src/gameplay/core/WorldGame");
const { GameStore } =
  require("../src/web/react/app/state/GameStore") as typeof import("../src/web/react/app/state/GameStore");
const { GameProvider } =
  require("../src/web/react/app/state/GameContext") as typeof import("../src/web/react/app/state/GameContext");
const { ShopPage } =
  require("../src/web/react/features/equipment/pages/ShopPage/ShopPage") as typeof import("../src/web/react/features/equipment/pages/ShopPage/ShopPage");
const { GlossaryProvider } =
  require("../src/web/react/app/GlossaryProvider/GlossaryProvider") as typeof import("../src/web/react/app/GlossaryProvider/GlossaryProvider");

describe("React shop supplies", () => {
  let store: GameStoreType;
  let game: WorldGameType;

  beforeEach(() => {
    environment.reset();
    store = new GameStore(new ReactMemoryStorage());
    game = WorldGame.create("Покупатель", "Knight", 1_760_000_000_000);
    game.save.tutorialCompleted = true;
    game.save.factionControl!.shopControllerId = "free-company";
    game.save.hero.factionReputation = {
      wardens: 0,
      "free-company": 0,
      "red-ledger": 0,
    };
    game.save.hero.gold = 200_000;
    game.save.hero.temperingMarks = 2;
    store.attach(game);
  });

  afterEach(() => {
    cleanup();
    store.dispose();
    jest.restoreAllMocks();
  });
  afterAll(() => environment.restore());

  function page() {
    const ui = render(
      <GameProvider store={store}>
        <ShopPage />
        <GlossaryProvider />
      </GameProvider>,
    );
    const panel = ui.getByRole("region", { name: "Печати закалки" });
    const single = within(panel).getByRole<HTMLButtonElement>("button", {
      name: /^Купить 1 печать/,
    });
    const five = within(panel).getByRole<HTMLButtonElement>("button", {
      name: /^Купить 5 печатей/,
    });
    return { ui, panel, single, five };
  }

  function total(panel: HTMLElement, label: string) {
    return within(panel)
      .getByText(label)
      .parentElement!.querySelector("dd")!
      .textContent!.replace(/\s/g, " ");
  }

  function suppliesEffects() {
    return store
      .getSnapshot()
      .effects.filter((effect) => effect.replaceKey === "shop-tempering-marks");
  }

  function offerNodes(ui: RenderResult) {
    return Array.from(
      ui.container.querySelectorAll("#shop-grid .item-card, #shop-grid svg"),
    );
  }

  test("buys the selected one or five seals for the exact price and persists the result without advancing the world", () => {
    const buy = jest.spyOn(game, "buyTemperingMarks");
    const before = {
      day: game.save.worldDay,
      shopDay: game.save.shopDay,
      inventory: JSON.stringify(game.save.hero.inventory),
      offers: JSON.stringify(game.save.shopOffers),
      legacySeals: game.save.legacy.seals,
    };
    const { panel, single, five } = page();
    fireEvent.click(single);
    expect(total(panel, "В запасе")).toBe("3");
    fireEvent.click(five);
    expect(buy.mock.calls).toEqual([[1], [5]]);
    expect(game.save.hero.gold).toBe(80_000);
    expect(game.save.hero.temperingMarks).toBe(8);
    expect(total(panel, "В запасе")).toBe("8");
    expect(game.save.worldDay).toBe(before.day);
    expect(game.save.shopDay).toBe(before.shopDay);
    expect(JSON.stringify(game.save.hero.inventory)).toBe(before.inventory);
    expect(JSON.stringify(game.save.shopOffers)).toBe(before.offers);
    expect(game.save.legacy.seals).toBe(before.legacySeals);
    store.flush();
    const saved = store.repository.load()!.save.hero;
    expect(saved.gold).toBe(80_000);
    expect(saved.temperingMarks).toBe(8);
    expect(suppliesEffects()).toHaveLength(1);
    expect(suppliesEffects()[0].aggregation?.count).toBe(6);
    expect(suppliesEffects()[0].aggregation?.totals.cost).toBe(120_000);
  });

  test("introduces Iona and the current shop cycle before suppliers and purchases", () => {
    const { ui } = page();
    const intro = ui.container.querySelector<HTMLElement>("#shop-intro")!;
    const controller = ui.container.querySelector<HTMLElement>("#shop-controller")!;
    const supplies = ui.container.querySelector<HTMLElement>("#shop-supplies")!;
    const stockHeading = ui.container.querySelector<HTMLElement>("#shop-stock-heading")!;
    const stock = ui.container.querySelector<HTMLElement>("#shop-grid")!;
    expect(intro.textContent).toContain("ИОНА · ХОЗЯЙКА ЛАВКИ");
    expect(intro.textContent).toContain(`с ${game.save.shopDay}-го дня`);
    for (const [first, second] of [
      [intro, controller],
      [controller, supplies],
      [supplies, stockHeading],
      [stockHeading, stock],
    ])
      expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("disables unaffordable quantities at the exact balance boundary and updates them after spending or receiving gold", () => {
    game.save.hero.gold = 20_000;
    const buy = jest.spyOn(game, "buyTemperingMarks");
    const { single, five } = page();
    expect(single.disabled).toBe(false);
    expect(five.disabled).toBe(true);
    fireEvent.click(five);
    expect(buy).not.toHaveBeenCalled();
    fireEvent.click(single);
    expect(game.save.hero.gold).toBe(0);
    expect(single.disabled).toBe(true);
    expect(five.disabled).toBe(true);
    act(() => {
      game.save.hero.gold = 99_999;
      store.publish();
    });
    expect(single.disabled).toBe(false);
    expect(five.disabled).toBe(true);
    act(() => {
      game.save.hero.gold += 1;
      store.publish();
    });
    expect(five.disabled).toBe(false);
    fireEvent.click(five);
    expect(buy.mock.calls).toEqual([[1], [5]]);
    expect(game.save.hero.gold).toBe(0);
    expect(game.save.hero.temperingMarks).toBe(8);
    expect(single.disabled).toBe(true);
    expect(five.disabled).toBe(true);
  });

  test("updates stock and faction reputation prices on the same controls without a bulk markup", () => {
    game.save.factionControl!.shopControllerId = "wardens";
    game.save.hero.factionReputation.wardens = 60;
    game.save.hero.gold = 80_000;
    game.save.hero.temperingMarks = 8;
    const { panel, single, five } = page();
    expect(total(panel, "В запасе")).toBe("8");
    expect(total(panel, "За одну печать")).toBe("16 000 ¤");
    expect(five.textContent!.replace(/\s/g, " ")).toContain("80 000 ¤");
    act(() => {
      game.save.factionControl!.shopControllerId = "red-ledger";
      game.save.hero.factionReputation["red-ledger"] = -100;
      game.save.hero.temperingMarks = 13;
      game.save.hero.gold = 118_000;
      store.publish();
    });
    expect(total(panel, "В запасе")).toBe("13");
    expect(total(panel, "За одну печать")).toBe("23 600 ¤");
    expect(single.textContent!.replace(/\s/g, " ")).toContain("23 600 ¤");
    expect(five.textContent!.replace(/\s/g, " ")).toContain("118 000 ¤");
    expect(panel.textContent!.replace(/\s/g, " ")).not.toContain("16 000 ¤");
    expect(
      within(panel).getByRole("button", { name: /^Купить 5 печатей/ }),
    ).toBe(five);
    fireEvent.click(five);
    expect(game.save.hero.gold).toBe(0);
    expect(total(panel, "В запасе")).toBe("18");
  });

  test("retains supply nodes, offer cards, artwork and keyboard focus through one hundred purchases", () => {
    game.save.hero.gold = 5_000_000;
    const buy = jest.spyOn(game, "buyTemperingMarks");
    const { ui, panel, single } = page();
    const nodes = Array.from(panel.querySelectorAll("*"));
    const offers = offerNodes(ui);
    expect(offers.length).toBeGreaterThan(0);
    single.focus();
    for (let index = 0; index < 100; index += 1) fireEvent.click(single);
    const currentNodes = Array.from(panel.querySelectorAll("*"));
    expect(currentNodes).toHaveLength(nodes.length);
    nodes.forEach((node, index) => expect(currentNodes[index]).toBe(node));
    const currentOffers = offerNodes(ui);
    expect(currentOffers).toHaveLength(offers.length);
    offers.forEach((node, index) => expect(currentOffers[index]).toBe(node));
    expect(document.activeElement).toBe(single);
    expect(buy).toHaveBeenCalledTimes(100);
    expect(buy.mock.calls.every(([quantity]) => quantity === 1)).toBe(true);
    expect(game.save.hero.temperingMarks).toBe(102);
    expect(total(panel, "В запасе")).toBe("102");
    expect(game.save.hero.gold).toBe(3_000_000);
    expect(suppliesEffects()).toHaveLength(1);
    expect(suppliesEffects()[0].aggregation?.count).toBe(100);
    expect(suppliesEffects()[0].aggregation?.totals.cost).toBe(2_000_000);
  }, 15000);

  test("handles a rejected purchase without a false success notification or changes to inventory", () => {
    const { panel, single } = page();
    const before = JSON.stringify(game.save.hero.inventory);
    game.save.hero.gold = 0;
    fireEvent.click(single);
    expect(game.save.hero.temperingMarks).toBe(2);
    expect(game.save.hero.gold).toBe(0);
    expect(JSON.stringify(game.save.hero.inventory)).toBe(before);
    expect(suppliesEffects()).toHaveLength(0);
    expect(
      store
        .getSnapshot()
        .effects.some(
          (effect) =>
            effect.description === "Недостаточно монет для покупки печатей.",
        ),
    ).toBe(true);
    act(() => store.publish());
    expect(single.disabled).toBe(true);
    expect(total(panel, "В запасе")).toBe("2");
  });

  test("keeps the seal explanation accessible by keyboard", () => {
    const { ui } = page();
    const title = ui.getByRole("heading", { name: "Печати закалки" });
    expect(title.tabIndex).toBe(0);
    act(() => title.focus());
    expect(ui.getByRole("tooltip").textContent).toContain("Печати закалки");
  });
});
