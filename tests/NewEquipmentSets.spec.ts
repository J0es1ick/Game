import { EQUIPMENT_SETS, ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import type {
  EquipmentSlot,
  HeroClass,
  Rarity,
  Stats,
} from "../src/gameplay/WorldTypes";
import {
  renderCharacterIllustration,
  type DollEquipmentState,
} from "../src/web/CharacterIllustration";

const SLOTS: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];

const NEW_SETS: Record<string, {
  classes: HeroClass[] | "all";
  bonuses: Array<Partial<Stats>>;
}> = {
  "salt-road": {
    classes: "all",
    bonuses: [{ speed: 4 }, { health: 26 }, { defense: 7 }],
  },
  "scarlet-archive": {
    classes: "all",
    bonuses: [{ crit: 6 }, { defense: 6 }, { attack: 6 }],
  },
  "blue-caravan": {
    classes: "all",
    bonuses: [{ attack: 5 }, { speed: 5 }, { health: 24 }],
  },
  "ashen-court": {
    classes: ["Knight", "Swordsman"],
    bonuses: [{ defense: 7 }, { attack: 7 }, { health: 30 }],
  },
  "mist-watch": {
    classes: ["Archer", "Gunsmith"],
    bonuses: [{ speed: 6 }, { defense: 6 }, { crit: 8 }],
  },
  "moon-cloister": {
    classes: ["Wizard", "Monk"],
    bonuses: [{ health: 32 }, { defense: 5 }, { speed: 7 }],
  },
};

function fakeElement(): HTMLElement {
  const values: Record<string, string> = {};
  return {
    dataset: {},
    innerHTML: "",
    style: {
      setProperty(name: string, value: string) {
        values[name] = value;
      },
    },
  } as unknown as HTMLElement;
}

function equipment(
  slot: EquipmentSlot,
  setId: string,
  rarity: Rarity = "epic",
): DollEquipmentState {
  return {
    name: `${setId}-${slot}`,
    rarity,
    rarityColor: "#8d6cad",
    setId,
    templateId: `${setId}-${slot}`,
  };
}

function renderSet(setId: string): string {
  const container = fakeElement();
  renderCharacterIllustration(container, "Knight", {
    chest: equipment("chest", setId),
    head: equipment("head", setId),
  });
  return container.innerHTML;
}

describe("новые комплекты добычи", () => {
  it("добавляет шесть полных наборов в общий каталог", () => {
    Object.entries(NEW_SETS).forEach(([setId, expected]) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId);
      const templates = ITEM_TEMPLATES.filter((item) => item.setId === setId);

      expect(set).toBeDefined();
      expect(set!.classes).toEqual(expected.classes);
      expect(set!.bonuses.map((bonus) => bonus.pieces)).toEqual([2, 4, 6]);
      expect(set!.bonuses.map((bonus) => bonus.stats)).toEqual(expected.bonuses);
      expect(templates).toHaveLength(6);
      expect(templates.map((item) => item.slot).sort()).toEqual([...SLOTS].sort());
      expect(new Set(templates.map((item) => item.name)).size).toBe(6);
      expect(templates.every((item) => item.allowedClasses === expected.classes
        || JSON.stringify(item.allowedClasses) === JSON.stringify(expected.classes))).toBe(true);
      expect(templates.every((item) => !item.exclusiveToBoss && !item.exclusiveToElite)).toBe(true);
      expect([...set!.pieces].sort()).toEqual(templates.map((item) => item.id).sort());
    });
  });

  it("создаёт каждую вещь через обычную фабрику лута", () => {
    Object.entries(NEW_SETS).forEach(([setId, expected]) => {
      const classId: HeroClass = expected.classes === "all"
        ? "Knight"
        : expected.classes[0];
      ITEM_TEMPLATES.filter((template) => template.setId === setId).forEach((template) => {
        const item = createItem(18, {
          classId,
          templateId: template.id,
          rarity: "common",
        });
        expect(item.templateId).toBe(template.id);
        expect(item.slot).toBe(template.slot);
        expect(item.setId).toBe(setId);
      });
    });
  });

  it("не превращает новые наборы в прямой скачок силы", () => {
    const weightedBonus = (stats: Partial<Stats>): number =>
      (stats.health ?? 0) / 5
      + (stats.attack ?? 0)
      + (stats.defense ?? 0)
      + (stats.speed ?? 0)
      + (stats.crit ?? 0);

    Object.keys(NEW_SETS).forEach((setId) => {
      const set = EQUIPMENT_SETS.find((candidate) => candidate.id === setId)!;
      const fullSetValue = set.bonuses.reduce(
        (sum, bonus) => sum + weightedBonus(bonus.stats ?? {}),
        0,
      );
      expect(fullSetValue).toBeGreaterThanOrEqual(14);
      expect(fullSetValue).toBeLessThanOrEqual(20);
    });
  });

  it("даёт каждому набору отдельную палитру и силуэт", () => {
    const renders = Object.keys(NEW_SETS).map(renderSet);
    const colors = renders.map((markup) =>
      markup.match(/--item-primary:(#[0-9a-f]{6})/i)?.[1],
    );
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(renders.length);

    const silhouettes = renders.map((markup) => markup
      .replace(/style="[^"]*"/g, "")
      .replace(/<title>.*?<\/title>/g, ""));
    expect(new Set(silhouettes).size).toBe(renders.length);
  });

  it("использует узнаваемые формы для трёх классовых пар", () => {
    const court = renderSet("ashen-court");
    expect(court).toContain("longcoat-back");
    expect(court).toContain("helmet-shell");
    expect(court).toContain("collar-ceremonial");

    const watch = renderSet("mist-watch");
    expect(watch).toContain("cape-back");
    expect(watch).toContain("goggle-strap");

    const cloister = renderSet("moon-cloister");
    expect(cloister).toContain("haori-left");
    expect(cloister).toContain("hood-shell");
    expect(cloister).toContain("layered-shoulders");
  });
});
