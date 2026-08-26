import { ITEM_TEMPLATES } from "../src/catalogs/WorldCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { considerNpcLoot } from "../src/gameplay/NpcEquipment";
import { WorldGame } from "../src/gameplay/WorldGame";
import { EquipmentItem, GameSave } from "../src/gameplay/WorldTypes";

function cloneItem(item: EquipmentItem, id: string): EquipmentItem {
  return {
    ...item,
    id,
    stats: { ...item.stats },
    allowedClasses: item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
  };
}

describe("NPC equipment decisions", () => {
  it("discards weaker drops and atomically replaces a slot with a real upgrade", () => {
    const game = WorldGame.create("Наблюдатель", "Knight", 1);
    const enemy = game.save.enemies[0];
    const current = enemy.equipment.find((item) => item.id === enemy.equipped.weapon)!;
    const initialCount = enemy.equipment.length;
    const weak = cloneItem(current, "weak-drop");
    weak.stats = {};

    expect(considerNpcLoot(enemy, weak)).toBe(false);
    expect(enemy.equipment).toHaveLength(initialCount);

    const upgrade = cloneItem(current, "strong-drop");
    upgrade.stats = { health: 50_000, attack: 5_000 };
    expect(considerNpcLoot(enemy, upgrade)).toBe(true);
    expect(enemy.equipped.weapon).toBe(upgrade.id);
    expect(enemy.equipment.filter((item) => item.slot === "weapon")).toEqual([upgrade]);
    expect(enemy.equipment.length).toBeLessThanOrEqual(6);
  });

  it("never replaces the elite crown set with an ordinary random drop", () => {
    const game = WorldGame.create("Смотритель", "Knight", 1);
    const enemy = game.save.enemies[0];
    const crownTemplate = ITEM_TEMPLATES.find((template) => template.exclusiveToElite && template.slot === "chest")!;
    const crown = createItem(enemy.level, { classId: enemy.classId, templateId: crownTemplate.id, rarity: "mythic" });
    expect(considerNpcLoot(enemy, crown)).toBe(true);

    const ordinary = createItem(enemy.level, { classId: enemy.classId, slot: "chest", rarity: "mythic" });
    ordinary.stats = { health: 1_000_000, attack: 1_000_000 };
    expect(considerNpcLoot(enemy, ordinary)).toBe(false);
    expect(enemy.equipped.chest).toBe(crown.id);
  });

  it("compacts bloated inventories while migrating an old save", () => {
    const game = WorldGame.create("Архивист", "Gunsmith", 1);
    const save = JSON.parse(JSON.stringify(game.save)) as GameSave;
    const enemy = save.enemies[0];
    const base = enemy.equipment[0];
    for (let index = 0; index < 20; index += 1) {
      const duplicate = cloneItem(base, `duplicate-${index}`);
      duplicate.stats = { attack: index };
      enemy.equipment.push(duplicate);
    }
    delete (enemy as unknown as Record<string, unknown>).arenaTournamentWins;

    const restored = WorldGame.restore(save);
    const migrated = restored.save.enemies.find((candidate) => candidate.id === enemy.id)!;
    expect(migrated.equipment.length).toBeLessThanOrEqual(6);
    expect(new Set(migrated.equipment.map((item) => item.slot)).size).toBe(migrated.equipment.length);
    expect(migrated.arenaTournamentWins).toHaveLength(6);
  });
});
