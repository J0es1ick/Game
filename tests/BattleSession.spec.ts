import { BattleSession, resolveCombat } from "../src/gameplay/combat/AdvancedBattle";
import { RandomSource, SeededRandom } from "../src/gameplay/core/RandomSource";
import type {
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  HeroClass,
  HeroProfile,
} from "../src/gameplay/core/WorldTypes";

const tactics = {
  id: "balanced",
  name: "Ровный бой",
  style: "balanced" as const,
  healThreshold: 0.55,
  finisherThreshold: 0.42,
  preserveStrongSkills: false,
  prioritizeControl: false,
};

const fixedRandom: RandomSource = {
  next: () => 0,
  int: (min) => min,
  chance: (probability) => probability > 0,
  pick: <T>(items: readonly T[]) => items[0],
  shuffle: <T>(items: readonly T[]) => [...items],
};

function fighters(classId: HeroClass = "Knight", level = 1): { hero: HeroProfile; enemy: EnemyProfile } {
  return {
    hero: {
      id: "hero", name: "Герой", classId, level, inventory: [], equipped: {}, traitIds: [], scarIds: [], injuries: [],
      autoSelectSkills: true, selectedSkillIds: [], tacticalProfiles: [tactics], activeTacticalProfileId: tactics.id,
    } as unknown as HeroProfile,
    enemy: {
      id: "enemy", name: "Соперник", classId: "Knight", level, equipment: [], equipped: {}, traitIds: [], scarIds: [],
      injuries: [], adaptationIds: [], tacticalStyle: "balanced",
    } as unknown as EnemyProfile,
  };
}

function equippedItem(id: string, slot: EquipmentSlot, stats: EquipmentItem["stats"], setId?: string): EquipmentItem {
  return { id, templateId: id, name: id, slot, rarity: "common", level: 1, stats, allowedClasses: "all", price: 0, setId };
}

function equipSet(hero: HeroProfile, setId: string): void {
  const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
  hero.inventory = slots.map((slot) => equippedItem(`${setId}-${slot}`, slot, {}, setId));
  hero.equipped = Object.fromEntries(hero.inventory.map((item) => [item.slot, item.id]));
}

describe("BattleSession", () => {
  test("использует скорость как постоянную инициативу, а не только право первого хода", () => {
    const { hero, enemy } = fighters();
    hero.inventory = [equippedItem("fast", "feet", { speed: 80, health: 1200 })];
    hero.equipped = { feet: "fast" };
    enemy.equipment = [equippedItem("durable", "chest", { health: 1200 })];
    enemy.equipped = { chest: "durable" };
    const result = resolveCombat(hero, enemy, { randomSource: new SeededRandom("initiative") });
    const heroActions = result.turns.filter((turn) => turn.actorId === hero.id).length;
    const enemyActions = result.turns.filter((turn) => turn.actorId === enemy.id).length;
    expect(heroActions).toBeGreaterThan(enemyActions);
  });

  test("принимает реальный выбор навыка в ручном пошаговом режиме", () => {
    const { hero, enemy } = fighters("Knight");
    hero.inventory = [equippedItem("fast", "feet", { speed: 100 })];
    hero.equipped = { feet: "fast" };
    const session = new BattleSession(hero, enemy, { randomSource: new SeededRandom("manual") });
    expect(session.currentActorId).toBe(hero.id);
    expect(session.availableActions().some((action) => action.id === "shield-bash" && action.available)).toBe(true);
    const turn = session.step({ type: "skill", skillId: "shield-bash" });
    expect(turn.skillId).toBe("shield-bash");
    expect(turn.action).toBe("Удар щитом");
  });

  test("после JSON-сохранения продолжает тот же бой с теми же эффектами и RNG", () => {
    const { hero, enemy } = fighters("Wizard", 20);
    hero.inventory = [equippedItem("fast", "feet", { speed: 30, health: 300 })];
    hero.equipped = { feet: "fast" };
    enemy.equipment = [equippedItem("durable", "chest", { health: 650, defense: 25 })];
    enemy.equipped = { chest: "durable" };
    const original = new BattleSession(hero, enemy, { randomSource: new SeededRandom("persist-mid-battle") });
    for (let index = 0; index < 5 && !original.isFinished; index += 1) original.step();

    const stored = JSON.parse(JSON.stringify(original.snapshot()));
    const restored = new BattleSession(stored);
    expect(restored.turns).toEqual(original.turns);
    expect(restored.currentActorId).toBe(original.currentActorId);
    expect(restored.fighterState(hero.id)).toEqual(original.fighterState(hero.id));
    expect(restored.fighterState(enemy.id)).toEqual(original.fighterState(enemy.id));
    expect(restored.runAutomatic()).toEqual(original.runAutomatic());
  });

  test("не обещает восстановление для несериализуемого источника случайности", () => {
    const { hero, enemy } = fighters();
    const session = new BattleSession(hero, enemy, { randomSource: fixedRandom });
    expect(() => session.snapshot()).toThrow(/random source supports snapshots/i);
  });

  test("создаёт отдельный классовый ресурс для каждого из шести классов", () => {
    const expected = [
      ["Knight", "resolve"], ["Archer", "focus"], ["Wizard", "arcana"],
      ["Monk", "chi"], ["Gunsmith", "heat"], ["Swordsman", "edge"],
    ] as const;
    expected.forEach(([classId, resourceId]) => {
      const { hero, enemy } = fighters(classId);
      const session = new BattleSession(hero, enemy, { randomSource: new SeededRandom(classId) });
      expect(session.fighterState(hero.id).resource.id).toBe(resourceId);
    });
  });

  test("полный Последний бастион один раз переживает смертельный удар", () => {
    const { hero, enemy } = fighters("Knight");
    equipSet(hero, "bastion");
    enemy.equipment = [equippedItem("executioner", "weapon", { attack: 5000, speed: 100 })];
    enemy.equipped = { weapon: "executioner" };
    const result = resolveCombat(hero, enemy, { randomSource: new SeededRandom("last-stand") });
    expect(result.turns.some((turn) => turn.detail.includes("последний бастион") && turn.targetHealth === 1)).toBe(true);
  });

  test("полный Астральный круг действительно сокращает перезарядку", () => {
    const { hero, enemy } = fighters("Wizard");
    equipSet(hero, "astral");
    const session = new BattleSession(hero, enemy, { randomSource: fixedRandom });
    session.step({ type: "skill", skillId: "ember" });
    while (!session.isFinished && session.currentActorId !== hero.id) session.step();
    expect(session.availableActions().find((action) => action.id === "ember")?.available).toBe(true);
  });

  test("полный Пороховой расчёт переносит крит на второй выстрел", () => {
    const { hero, enemy } = fighters("Gunsmith");
    equipSet(hero, "powder");
    const session = new BattleSession(hero, enemy, { randomSource: fixedRandom });
    const turn = session.step({ type: "basic" });
    expect(turn.critical).toBe(true);
    expect(turn.detail).toContain("второй удар");
    expect(turn.detail).toContain("(критический)");
  });

  test("полные Парные сумерки лечат владельца критическим ударом", () => {
    const { hero, enemy } = fighters("Swordsman");
    equipSet(hero, "dusk");
    enemy.equipment = [equippedItem("quick", "feet", { speed: 80 })];
    enemy.equipped = { feet: "quick" };
    const session = new BattleSession(hero, enemy, { randomSource: fixedRandom });
    while (!session.isFinished && session.currentActorId !== hero.id) session.step({ type: "basic" });
    expect(session.isFinished).toBe(false);
    const turn = session.step({ type: "basic" });
    expect(turn.critical).toBe(true);
    expect(turn.healing).toBeGreaterThan(0);
    expect(turn.detail).toContain("парные сумерки");
  });

  test("Фора претендента применяется только к бойцу меньшего уровня", () => {
    const { hero, enemy } = fighters("Knight", 1);
    enemy.level = 5;
    const baseline = resolveCombat(hero, enemy, { randomSource: new SeededRandom("baseline") });
    const favored = resolveCombat(hero, enemy, {
      ruleIds: ["challenger-favor"],
      randomSource: new SeededRandom("favored"),
    });
    expect(favored.hero.maxHealth).toBe(baseline.hero.maxHealth + 14);
    expect(favored.enemy.maxHealth).toBe(baseline.enemy.maxHealth);
  });
});
