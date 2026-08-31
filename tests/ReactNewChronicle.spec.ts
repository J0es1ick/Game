import { createElement, act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ERA_LAWS } from "../src/catalogs/NewGamePlusCatalog";
import { ARENAS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { NewChronicleDialog } from "../src/web/react/features/progression/NewChronicleDialog/NewChronicleDialog";

jest.mock(
  "../src/web/react/features/equipment/styles/components.css",
  () => ({}),
);
jest.mock("../src/web/react/app/state/GameContext", () => ({
  useGame: () => mockContext,
}));

const { JSDOM } = require("jsdom");
let mockContext: {
  game: WorldGame;
  revision: number;
  closeDialog: jest.Mock;
  notify: jest.Mock;
  act: jest.Mock;
  store: { replaceGame: jest.Mock; navigate: jest.Mock };
};

describe("React new chronicle", () => {
  let root: Root;
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
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockContext = {
      game: WorldGame.create("Хронист", "Knight", 2014),
      revision: 0,
      closeDialog: jest.fn(),
      notify: jest.fn(),
      act: jest.fn(),
      store: { replaceGame: jest.fn(), navigate: jest.fn() },
    };
  });

  afterEach(() => {
    reactAct(() => root.unmount());
    dom.window.close();
    jest.restoreAllMocks();
    originals.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  });

  const eligible = () => {
    const save = mockContext.game.save;
    save.hero.highestArena = ARENAS.length - 1;
    save.hero.arenaWins[ARENAS.length - 1] = 1;
    save.hero.crownLeagueWins = 1;
    save.hero.legendDefenses = 1;
    save.eliteLeagueMemberIds = [
      "hero",
      ...save.eliteLeagueMemberIds.filter((id) => id !== "hero"),
    ].slice(0, 30);
    save.eliteRatings.hero = 4000;
  };
  const render = () =>
    reactAct(() => root.render(createElement(NewChronicleDialog)));
  const query = <T extends HTMLElement = HTMLButtonElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  const click = (element: HTMLElement) => reactAct(() => element.click());
  const next = () => click(query("#new-chronicle-next"));
  const lawCards = () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Законы новой эпохи"] .new-chronicle-choice',
      ),
    );
  const finalStep = () => {
    next();
    next();
    next();
  };

  it("does not allow a new epoch before the endgame requirements are met", () => {
    render();
    expect(query("#new-chronicle-next").disabled).toBe(true);
    expect(document.body.textContent).toContain("Сначала выполните условия");
    expect(mockContext.store.replaceGame).not.toHaveBeenCalled();
  });

  it("disables a legacy whose seal cost cannot be paid", () => {
    eligible();
    const status = mockContext.game.newGamePlusStatus();
    jest
      .spyOn(mockContext.game, "newGamePlusStatus")
      .mockReturnValue({ ...status, availableSeals: 2 });
    render();
    expect(query('[data-choice-id="masters-school"]').disabled).toBe(true);
    expect(
      query('[data-choice-id="court-name"]').getAttribute("aria-pressed"),
    ).toBe("true");
    expect(query("#new-chronicle-next").disabled).toBe(false);
  });

  it("replaces the single law with one click and preserves its card and focus", () => {
    eligible();
    render();
    next();
    next();
    const second = lawCards()[1];
    second.focus();
    click(second);
    expect(
      lawCards().filter((card) => card.getAttribute("aria-pressed") === "true"),
    ).toEqual([second]);
    expect(query(`[data-choice-id="${ERA_LAWS[1].id}"]`)).toBe(second);
    expect(document.activeElement).toBe(second);
    expect(query("#new-chronicle-next").disabled).toBe(false);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    click(second);
    expect(query("#new-chronicle-next").disabled).toBe(true);
  });

  it("enforces the multi-law limit without losing already selected laws", () => {
    eligible();
    const status = mockContext.game.newGamePlusStatus();
    jest
      .spyOn(mockContext.game, "newGamePlusStatus")
      .mockReturnValue({ ...status, targetCycle: 3, lawLimit: 2 });
    render();
    next();
    next();
    click(lawCards()[2]);
    expect(
      lawCards().filter((card) => card.getAttribute("aria-pressed") === "true"),
    ).toHaveLength(2);
    expect(query('[role="alert"]').textContent).toContain(
      "не больше 2 законов",
    );
    click(lawCards()[0]);
    expect(query("#new-chronicle-next").disabled).toBe(true);
    click(lawCards()[2]);
    expect(query("#new-chronicle-next").disabled).toBe(false);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("requires a fresh acknowledgement after returning from the final step", () => {
    eligible();
    render();
    finalStep();
    expect(query("#new-chronicle-confirm").disabled).toBe(true);
    click(query("#new-chronicle-acknowledge"));
    expect(query("#new-chronicle-confirm").disabled).toBe(false);
    click(query("#new-chronicle-back"));
    next();
    expect(query<HTMLInputElement>("#new-chronicle-acknowledge").checked).toBe(
      false,
    );
    expect(query("#new-chronicle-confirm").disabled).toBe(true);
    expect(mockContext.store.replaceGame).not.toHaveBeenCalled();
  });

  it("archives the previous hero and installs the new game only after confirmation", () => {
    eligible();
    const previous = mockContext.game;
    const before = JSON.stringify(previous.save);
    const start = jest.spyOn(previous, "beginNewChronicle");
    render();
    next();
    next();
    click(lawCards()[1]);
    next();
    expect(start).not.toHaveBeenCalled();
    click(query("#new-chronicle-acknowledge"));
    click(query("#new-chronicle-confirm"));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0].lawIds).toEqual([ERA_LAWS[1].id]);
    expect(mockContext.act).not.toHaveBeenCalled();
    expect(mockContext.store.replaceGame).toHaveBeenCalledTimes(1);
    const replacement = mockContext.store.replaceGame.mock
      .calls[0][0] as WorldGame;
    expect(replacement).not.toBe(previous);
    expect(replacement.save.legacy.cycle).toBe(2);
    expect(replacement.save.legacy.archives[0].name).toBe("Хронист");
    expect(replacement.save.hero.level).toBe(1);
    expect(replacement.save.legacy.inheritedItemId).toBeDefined();
    expect(JSON.stringify(previous.save)).toBe(before);
    expect(mockContext.store.navigate).toHaveBeenCalledWith("map");
    expect(mockContext.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Добро пожаловать в эпоху 2",
        variant: "era",
        stats: expect.arrayContaining([
          expect.stringMatching(/^Наследие:/),
          expect.stringMatching(/^Предмет:/),
          `Законы мира: ${ERA_LAWS[1].name}`,
        ]),
      }),
    );
  });

  it("keeps the old game and confirmation available when the transition fails", () => {
    eligible();
    jest.spyOn(mockContext.game, "beginNewChronicle").mockImplementation(() => {
      throw new Error("Переход временно недоступен");
    });
    render();
    finalStep();
    click(query("#new-chronicle-acknowledge"));
    click(query("#new-chronicle-confirm"));
    expect(mockContext.store.replaceGame).not.toHaveBeenCalled();
    expect(query('[role="alert"]').textContent).toContain(
      "Переход временно недоступен",
    );
    expect(query("#new-chronicle-confirm").disabled).toBe(false);
    expect(mockContext.game.save.legacy.archives).toHaveLength(0);
  });

  it("paginates heirlooms without making any of them unreachable", () => {
    eligible();
    const source = mockContext.game.heirloomCandidates()[0];
    Array.from({ length: 35 }, (_, index) =>
      mockContext.game.save.hero.inventory.push({
        ...source,
        id: `heirloom-${index}`,
      }),
    );
    render();
    next();
    expect(
      document.querySelectorAll(".heirloom-grid .new-chronicle-choice"),
    ).toHaveLength(13);
    const more = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        ".equipment-pagination button",
      ),
    ).find((button) => button.textContent?.startsWith("Далее"))!;
    const firstIds = Array.from(
      document.querySelectorAll<HTMLElement>(".heirloom-grid [data-choice-id]"),
    ).map((element) => element.dataset.choiceId);
    click(more);
    const nextIds = Array.from(
      document.querySelectorAll<HTMLElement>(".heirloom-grid [data-choice-id]"),
    ).map((element) => element.dataset.choiceId);
    expect(nextIds.some((id) => !firstIds.includes(id))).toBe(true);
    expect(
      document.querySelectorAll(".heirloom-grid .new-chronicle-choice"),
    ).toHaveLength(13);
  });
});
