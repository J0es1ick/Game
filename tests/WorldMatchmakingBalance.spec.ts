import { DUEL_TIERS } from "../src/catalogs/WorldCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import { DuelDefinition, EnemyProfile, EquipmentItem } from "../src/gameplay/WorldTypes";

interface MatchmakingAccess {
  createDungeonEnemy(levels: [number, number], name: string): EnemyProfile;
  matchDuelEnemy(tier: DuelDefinition, arenaIndex: number): EnemyProfile;
  addItem(item: EquipmentItem): void;
}

describe("world opponent balance", () => {
  it("creates dungeon equipment at the actual monster level independently of hero progression", () => {
    const early = WorldGame.create("Early", "Swordsman", 94111);
    const late = WorldGame.create("Late", "Swordsman", 94111);
    late.save.hero.highestArena = 5;
    const earlyAccess = early as unknown as MatchmakingAccess;
    const lateAccess = late as unknown as MatchmakingAccess;
    for (let index = 0; index < 15; index += 1) {
      const first = earlyAccess.createDungeonEnemy([2, 4], "Test");
      const second = lateAccess.createDungeonEnemy([2, 4], "Test");
      expect(second.level).toBe(first.level);
      expect(second.equipment).toEqual(first.equipment);
      expect(second.factionId).toBe(first.factionId);
      expect(second.traitIds).toEqual(first.traitIds);
      expect(second.equipment.every((item) => item.level === second.level)).toBe(true);
      expect(second.equipment).toHaveLength(2);
    }
  });

  it("gives deeper dungeon monsters equipment matching their level even before the final arena", () => {
    const game = WorldGame.create("Audit", "Swordsman", 94112);
    const enemy = (game as unknown as MatchmakingAccess).createDungeonEnemy([32, 32], "Deep");
    expect(enemy.level).toBe(32);
    expect(enemy.equipment).toHaveLength(6);
    expect(enemy.equipment.every((item) => item.level === 32)).toBe(true);
    expect(Object.values(enemy.equipped).sort()).toEqual(enemy.equipment.map((item) => item.id).sort());
  });

  it("uses effective strength to distinguish equally leveled duel opponents", () => {
    const game = WorldGame.create("Audit", "Swordsman", 94113);
    const hero = game.save.hero;
    const similar: EnemyProfile = {
      ...game.save.enemies[0], id: "similar", classId: hero.classId, level: hero.level,
      equipment: JSON.parse(JSON.stringify(hero.inventory)), equipped: { ...hero.equipped },
      traitIds: [...hero.traitIds], scarIds: [], injuries: [], arenaIndex: 0, alive: true,
    };
    const stronger: EnemyProfile = {
      ...similar, id: "stronger", injuries: [{
        id: "strong", name: "Strength", description: "Strength", gainedDay: 1,
        remainingDays: 1, stats: { health: 10_000, attack: 2_000, speed: 150 },
      }],
    };
    game.save.enemies = [stronger, similar];
    for (let index = 0; index < 20; index += 1) {
      expect((game as unknown as MatchmakingAccess).matchDuelEnemy(DUEL_TIERS[0], 0).id).toBe("similar");
    }
  });

  it("never changes equipment from a new drop while automatic equipment is disabled", () => {
    const game = WorldGame.create("Audit", "Swordsman", 94114);
    game.save.hero.autoEquipBest = false;
    const before = { ...game.save.hero.equipped };
    const upgrade: EquipmentItem = {
      ...game.save.hero.inventory[0], id: "new-upgrade", stats: { attack: 2_000, speed: 100 },
    };
    (game as unknown as MatchmakingAccess).addItem(upgrade);
    expect(game.save.hero.equipped).toEqual(before);
  });
});
