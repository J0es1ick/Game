import { createElement, act as reactAct, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import { WorldGame } from "../src/gameplay/WorldGame";
import { compareEquipment } from "../src/gameplay/EquipmentComparison";
import {
  EquipmentComparisonDialog,
  EquipmentPickerDialog,
} from "../src/web/react/equipment/EquipmentDialogs";
import { NewChronicleDialog } from "../src/web/react/dialogs/NewChronicleDialog";
import { DialogVisibility } from "../src/web/react/components/common";
import { rarityColors, statKeys } from "../src/web/react/equipment/model";

jest.mock("../src/web/react/equipment/equipment-react.css", () => ({}));
jest.mock("../src/web/react/state/GameContext", () => ({
  useGame: () => mockContext,
}));

const { JSDOM } = require("jsdom");
const postcss = require("postcss");
const stylesheet = [
  "src/web/styles/equipment.css",
  "src/web/styles/new-chronicle.css",
  "src/web/styles/react-ui.css",
  "src/web/react/equipment/equipment-react.css",
]
  .map((path) =>
    postcss
      .parse(readFileSync(resolve(__dirname, "..", path), "utf8"))
      .nodes.filter((node: { type: string }) => node.type === "rule")
      .map((node: { toString(): string }) => node.toString())
      .join("\n"),
  )
  .join("\n");

let mockContext: {
  game: WorldGame;
  revision: number;
  act: <T>(action: (game: WorldGame) => T) => T;
  closeDialog: jest.Mock;
  openDialog: jest.Mock;
  notify: jest.Mock;
  store: { replaceGame: jest.Mock };
};

describe("React equipment dialogs", () => {
  let root: Root;
  let dom: InstanceType<typeof JSDOM>;
  let current: ComponentType;
  let visible = true;
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
  const draw = () =>
    root.render(
      createElement(
        DialogVisibility.Provider,
        { value: visible },
        createElement(current),
      ),
    );

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
      url: "https://example.test/Game/",
    });
    globals.forEach((key) =>
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
      }),
    );
    const style = document.createElement("style");
    style.textContent = stylesheet;
    document.head.append(style);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    visible = true;
    const game = WorldGame.create("Проверка окон", "Knight", 947);
    mockContext = {
      game,
      revision: 0,
      closeDialog: jest.fn(),
      openDialog: jest.fn(),
      notify: jest.fn(),
      store: { replaceGame: jest.fn() },
      act: (action) => {
        const result = action(game);
        mockContext.revision += 1;
        draw();
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
    reactAct(draw);
  };
  const click = (element: HTMLElement) => reactAct(() => element.click());

  it("preserves slot picker cards and art through repeated equip changes", () => {
    const hero = mockContext.game.save.hero;
    const source = hero.inventory.find((item) => item.slot === "weapon")!;
    hero.inventory.push({ ...source, id: "candidate-weapon", level: 2 });
    render(() => createElement(EquipmentPickerDialog, { slot: "weapon" }));
    const card = document.querySelector<HTMLElement>(
      '[data-item-id="candidate-weapon"]',
    )!;
    const artwork = card.querySelector("svg");
    const button = Array.from(card.querySelectorAll("button")).find(
      (entry) => entry.textContent === "Надеть",
    )!;
    const cards = Array.from(
      document.querySelectorAll("#equipment-picker-grid .item-card"),
    );
    button.focus();
    for (let index = 0; index < 6; index += 1) {
      click(button);
      expect(
        Array.from(
          document.querySelectorAll("#equipment-picker-grid .item-card"),
        ),
      ).toEqual(cards);
      expect(card.querySelector("svg")).toBe(artwork);
      expect(document.activeElement).toBe(button);
    }
  });

  it("compares full hero stats and equips the selected item through the native dialog", () => {
    const hero = mockContext.game.save.hero;
    const equipped = hero.inventory.find(
      (item) => item.id === hero.equipped.weapon,
    )!;
    const candidate = {
      ...equipped,
      id: "comparison-candidate",
      rarity: "epic" as const,
      stats: { attack: 25, defense: 5 },
    };
    hero.inventory.push(candidate);
    const expected = compareEquipment(hero, candidate, equipped);
    render(() =>
      createElement(EquipmentComparisonDialog, { itemId: candidate.id }),
    );
    expect(
      document
        .querySelector<HTMLElement>("#comparison-candidate")!
        .style.getPropertyValue("--rarity-color"),
    ).toBe(rarityColors.epic);
    const rows = Array.from(document.querySelectorAll(".comparison-stat"));
    expect(rows).toHaveLength(statKeys.length);
    statKeys.forEach((stat, index) => {
      const difference = expected.candidate[stat] - expected.current[stat];
      expect(
        rows[index].querySelector(".stat-comparison-delta")!.textContent,
      ).toBe(`${difference > 0 ? "+" : ""}${difference}`);
      expect(
        rows[index].querySelectorAll(".stat-comparison-values i")[0]
          .textContent,
      ).toBe(String(expected.current[stat]));
    });
    click(document.querySelector<HTMLButtonElement>("#comparison-equip")!);
    expect(hero.equipped.weapon).toBe(candidate.id);
    expect(mockContext.closeDialog).toHaveBeenCalledTimes(1);
  });

  it("keeps sizing on the modal paper and lets the visibility layer hide every equipment dialog", () => {
    const itemId = mockContext.game.save.hero.inventory[0].id;
    const variants = [
      () => createElement(EquipmentPickerDialog, { slot: "weapon" as const }),
      () => createElement(EquipmentComparisonDialog, { itemId }),
      NewChronicleDialog,
    ];
    for (const component of variants) {
      visible = true;
      render(component);
      const layer = document.querySelector<HTMLElement>(".react-modal-layer")!;
      expect(dom.window.getComputedStyle(layer).width).toBe("auto");
      expect(dom.window.getComputedStyle(layer).padding).toBe("16px");
      expect(
        layer
          .querySelector("[role=dialog]")!
          .classList.contains("react-modal-paper"),
      ).toBe(true);
      visible = false;
      reactAct(draw);
      expect(dom.window.getComputedStyle(layer).display).toBe("none");
    }
  });

  it("keeps new chronicle actions outside its scrolling body", () => {
    render(NewChronicleDialog);
    const actions = document.querySelector<HTMLElement>(
      ".new-chronicle-actions",
    )!;
    expect(actions.closest(".react-modal-footer")).not.toBeNull();
    expect(actions.closest(".react-modal-body")).toBeNull();
    expect(dom.window.getComputedStyle(actions).position).toBe("static");
    expect(dom.window.getComputedStyle(actions).padding).toBe("0px");
    expect(
      dom.window.getComputedStyle(
        document.querySelector(".new-chronicle-stage")!,
      ).padding,
    ).toBe("24px 26px");
  });
});
